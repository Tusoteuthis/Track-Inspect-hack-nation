import SwiftUI
import AVFoundation
import Observation

@MainActor @Observable final class InspectionViewModel {
    var preview: UIImage?
    var analysis: AnalysisResult?
    var transcript: [TranscriptLine] = []
    var videoStatus = "Not streaming"
    var voiceStatus = "Idle"
    var error: String?
    private(set) var isVideoRunning = false
    private(set) var isVoiceRunning = false
    private(set) var isVideoBusy = false
    private(set) var isVoiceBusy = false
    private(set) var isVideoStopping = false
    private(set) var isVoiceStopping = false
    private(set) var isMuted = true
    private(set) var isForeground = true
    var audioRoute = "Not active"
    var shareFindings = false {
        didSet {
            if !shareFindings { contextTask?.cancel() }
        }
    }
    private(set) var analyzedFrames = 0

    private let video: any VideoService
    private let analyzer: any AnalysisService
    private let voice: any VoiceService
    private let timing: SessionTiming
    private let now: @MainActor () -> TimeInterval
    @ObservationIgnored private var videoTask: Task<Void, Never>?
    @ObservationIgnored private var voiceTask: Task<Void, Never>?
    @ObservationIgnored private var videoStopTask: Task<Void, Never>?
    @ObservationIgnored private var voiceStopTask: Task<Void, Never>?
    @ObservationIgnored private var analysisTask: Task<Void, Never>?
    @ObservationIgnored private var contextTask: Task<Void, Never>?
    @ObservationIgnored private var watchdog: Task<Void, Never>?
    @ObservationIgnored private var routeTask: Task<Void, Never>?
    private var lastAnalysis = -TimeInterval.infinity
    private var lastContext = -TimeInterval.infinity
    private var lastFrame: TimeInterval = 0
    private var videoGeneration = UUID()
    private var voiceGeneration = UUID()
    private var analysisGeneration = UUID()
    private var pendingPhoto: UIImage?

    init(video: any VideoService, analyzer: any AnalysisService, voice: any VoiceService,
         timing: SessionTiming = SessionTiming(),
         now: @escaping @MainActor () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.video = video
        self.analyzer = analyzer
        self.voice = voice
        self.timing = timing
        self.now = now
        routeTask = Task { [weak self] in
            for await _ in NotificationCenter.default.notifications(named: AVAudioSession.routeChangeNotification) {
                guard !Task.isCancelled else { return }
                self?.refreshRoute()
            }
        }
    }

    // MARK: - Registration and lifecycle

    func pair() async {
        do {
            try await video.register()
            videoStatus = "Complete pairing in Meta AI, then start video."
        } catch { self.error = error.localizedDescription }
    }

    func handle(url: URL) async {
        do { try await video.handle(url: url) }
        catch { self.error = error.localizedDescription }
    }

    /// Invalidate both pipelines synchronously before the scene leaves the foreground.
    func setForeground(_ active: Bool) {
        isForeground = active
        if !active {
            shareFindings = false
            _ = beginStopVideo()
            _ = beginStopVoice()
        }
    }

    func stopAll() async {
        // Begin both before awaiting either: slow camera teardown must not hold the mic open.
        let videoStop = beginStopVideo()
        let voiceStop = beginStopVoice()
        await videoStop.value
        await voiceStop.value
    }

    // MARK: - Video

    func startVideo() {
        guard isForeground, !isVideoRunning, !isVideoBusy, !isVideoStopping else { return }
        error = nil
        cancelAnalysis()
        preview = nil
        isVideoRunning = true
        isVideoBusy = true
        videoStatus = "Starting glasses…"
        lastFrame = now()
        lastAnalysis = -.infinity
        let generation = UUID()
        videoGeneration = generation
        bindVideo(generation: generation)
        videoTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isVideoBusy = false }
            do {
                try Task.checkCancellation()
                try await self.video.start()
                try Task.checkCancellation()
                guard self.videoGeneration == generation else { return }
                self.lastFrame = self.now()
                self.watchdog = Task { [weak self, interval = self.timing.watchdogInterval] in
                    while !Task.isCancelled {
                        do { try await Task.sleep(for: interval) } catch { return }
                        guard let self, self.videoGeneration == generation, self.isVideoRunning else { return }
                        if self.now() - self.lastFrame >= self.timing.frameTimeout {
                            self.error = "No video frames for \(Int(self.timing.frameTimeout)) seconds. Check glasses connection and stop competing camera/audio apps."
                            _ = self.beginStopVideo()
                            return
                        }
                    }
                }
            } catch {
                guard self.videoGeneration == generation else { return }
                if !(error is CancellationError) { self.error = error.localizedDescription }
                // Do not await our own startup task from its cleanup path.
                _ = self.beginStopVideo()
            }
        }
    }

    func stopVideo() async { await beginStopVideo().value }

    private func beginStopVideo() -> Task<Void, Never> {
        if let videoStopTask { return videoStopTask }
        videoGeneration = UUID()
        isVideoRunning = false
        isVideoStopping = true
        videoStatus = "Stopping video…"
        video.onFrame = nil
        video.onStatus = nil
        video.onFailure = nil
        videoTask?.cancel()
        watchdog?.cancel()
        watchdog = nil
        cancelAnalysis()
        preview = nil
        let start = videoTask
        let task = Task { [self] in
            await start?.value
            await video.stop()
            videoTask = nil
            videoStopTask = nil
            isVideoBusy = false
            isVideoStopping = false
            videoStatus = "Not streaming"
        }
        videoStopTask = task
        return task
    }

    private func bindVideo(generation: UUID) {
        video.onFrame = { [weak self] image in
            guard let self, self.videoGeneration == generation, self.isVideoRunning, self.isForeground else { return }
            self.lastFrame = self.now()
            self.videoStatus = "Live · Meta Ray-Ban"
            self.receive(image)
        }
        video.onStatus = { [weak self] status in
            guard let self, self.videoGeneration == generation else { return }
            self.videoStatus = status
        }
        video.onFailure = { [weak self] message in
            guard let self, self.videoGeneration == generation else { return }
            self.error = message
            _ = self.beginStopVideo()
        }
    }

    // MARK: - Voice

    func startVoice(agentID: String) {
        guard isForeground, !isVoiceRunning, !isVoiceBusy, !isVoiceStopping else { return }
        error = nil
        isVoiceRunning = true
        isVoiceBusy = true
        voiceStatus = "Connecting"
        transcript = []
        lastContext = -.infinity
        let generation = UUID()
        voiceGeneration = generation
        bindVoice(generation: generation)
        voiceTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isVoiceBusy = false }
            do {
                try Task.checkCancellation()
                try await self.voice.start(agentID: agentID)
                try Task.checkCancellation()
                guard self.voiceGeneration == generation else { return }
                self.refreshRoute()
            } catch {
                guard self.voiceGeneration == generation else { return }
                if !(error is CancellationError) { self.error = error.localizedDescription }
                _ = self.beginStopVoice()
            }
        }
    }

    func stopVoice() async { await beginStopVoice().value }

    private func beginStopVoice() -> Task<Void, Never> {
        if let voiceStopTask { return voiceStopTask }
        voiceGeneration = UUID()
        isVoiceRunning = false
        isVoiceStopping = true
        isMuted = true
        voiceStatus = "Ending voice…"
        voice.onStatus = nil
        voice.onTranscript = nil
        voice.onMuted = nil
        voiceTask?.cancel()
        contextTask?.cancel()
        let start = voiceTask
        let context = contextTask
        let task = Task { [self] in
            await start?.value
            // Stop capture before waiting for a slow contextual-message send.
            await voice.stop()
            await context?.value
            voiceTask = nil
            voiceStopTask = nil
            isVoiceBusy = false
            isVoiceStopping = false
            voiceStatus = "Idle"
            audioRoute = "Not active"
        }
        voiceStopTask = task
        return task
    }

    private func bindVoice(generation: UUID) {
        voice.onStatus = { [weak self] status in
            guard let self, self.voiceGeneration == generation else { return }
            self.voiceStatus = status
            if status == "Ended" || status.hasPrefix("Error:") {
                if status.hasPrefix("Error:") { self.error = status }
                _ = self.beginStopVoice()
            }
            self.refreshRoute()
        }
        voice.onTranscript = { [weak self] lines in
            guard let self, self.voiceGeneration == generation else { return }
            self.transcript = Array(lines.suffix(100))
        }
        voice.onMuted = { [weak self] muted in
            guard let self, self.voiceGeneration == generation else { return }
            self.isMuted = muted
        }
    }

    func toggleMute() async {
        guard isVoiceRunning, !isVoiceBusy else { return }
        let generation = voiceGeneration
        do { try await voice.setMuted(!isMuted) }
        catch {
            if voiceGeneration == generation { self.error = error.localizedDescription }
        }
    }

    func preferPhoneAudio(_ phone: Bool) {
        guard isVoiceRunning, !isVoiceBusy else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            let input = session.availableInputs?.first {
                $0.portType == (phone ? .builtInMic : .bluetoothHFP)
            }
            guard let input else { throw AppFailure(message: "Requested input unavailable. Pair glasses in iOS Bluetooth Settings, or choose iPhone audio.") }
            try session.setPreferredInput(input)
            try session.overrideOutputAudioPort(phone ? .speaker : .none)
            refreshRoute()
        } catch { self.error = error.localizedDescription }
    }

    // MARK: - Local inference and opt-in context

    func analyzePhoto(_ image: UIImage) {
        guard isForeground, !isVideoRunning, !isVideoBusy, !isVideoStopping else { return }
        cancelAnalysis()
        preview = image
        lastAnalysis = -.infinity
        videoStatus = "Test photo · not live"
        if analysisTask != nil {
            // One replaceable slot for user-selected photos, never a queue of video frames.
            pendingPhoto = image
        } else {
            receive(image)
        }
    }

    private func receive(_ image: UIImage) {
        preview = image
        guard analysisTask == nil, now() - lastAnalysis >= timing.analysisInterval else { return }
        guard let data = image.jpegData(compressionQuality: 0.8) else { return }
        lastAnalysis = now()
        let captured = Date.now
        let generation = analysisGeneration
        analysisTask = Task { [weak self, analyzer] in
            defer { self?.finishAnalysis() }
            do {
                try Task.checkCancellation()
                let result = try await analyzer.analyze(jpeg: data, capturedAt: captured)
                guard let self, !Task.isCancelled, self.analysisGeneration == generation, self.isForeground else { return }
                self.analysis = result
                self.analyzedFrames += 1
                self.sendContextIfAllowed(result)
            } catch {
                guard let self, self.analysisGeneration == generation, !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
        }
    }

    private func finishAnalysis() {
        analysisTask = nil
        if let image = pendingPhoto, isForeground, !isVideoRunning, !isVideoStopping {
            pendingPhoto = nil
            lastAnalysis = -.infinity
            receive(image)
        }
    }

    private func sendContextIfAllowed(_ result: AnalysisResult) {
        guard shareFindings, isVoiceRunning, !isVoiceBusy, isForeground, contextTask == nil,
              now() - lastContext >= timing.contextInterval else { return }
        let generation = voiceGeneration
        lastContext = now()
        contextTask = Task { [weak self] in
            guard let self else { return }
            defer { self.contextTask = nil }
            guard self.shareFindings, self.voiceGeneration == generation, !Task.isCancelled else { return }
            do { try await self.voice.updateContext(result.context) }
            catch {
                guard !Task.isCancelled, self.voiceGeneration == generation, self.shareFindings else { return }
                self.error = "Could not share analysis: \(error.localizedDescription)"
            }
        }
    }

    private func cancelAnalysis() {
        analysisGeneration = UUID()
        analysisTask?.cancel()
        // Keep the slot until the operation really returns; cancellation isn't preemption.
        pendingPhoto = nil
        analysis = nil
    }

    private func refreshRoute() {
        guard isVoiceRunning else { audioRoute = "Not active"; return }
        let route = AVAudioSession.sharedInstance().currentRoute
        audioRoute = "In: \(route.inputs.map(\.portName).joined(separator: ", ")) · Out: \(route.outputs.map(\.portName).joined(separator: ", "))"
    }

    deinit {
        routeTask?.cancel()
        watchdog?.cancel()
        videoTask?.cancel()
        voiceTask?.cancel()
        analysisTask?.cancel()
        contextTask?.cancel()
    }
}
