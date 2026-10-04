import SwiftUI
import AVFoundation
import Observation

/// The latest frame in which a pointing finger and its target were found. Memory only.
struct PointingCapture {
    let image: UIImage
    let pointing: Pointing
    let target: PointingTarget
    let capturedAt: Date
    /// Cloud description of this exact frame, once it has arrived.
    var description: String? = nil
}

@MainActor @Observable final class InspectionViewModel {
    var preview: UIImage?
    private(set) var pointingCapture: PointingCapture?
    var analysis: AnalysisResult?
    var transcript: [TranscriptLine] = []
    var videoStatus = "Not streaming"
    var voiceStatus = "Idle"
    var error: String?
    private(set) var isPairing = false
    private(set) var isUnpairing = false
    private(set) var isUnpairPending = false
    private(set) var unpairMessage: String?
    private(set) var glassesRegistration: GlassesRegistrationStatus?
    private var glassesLink: GlassesConnectionStatus = .checking
    private var keepsPhoneAudio = false
    private var lastVideoFrame: TimeInterval?
    private var connectionCheckedAt: TimeInterval = 0

    var glassesConnection: GlassesConnectionStatus {
        guard isForeground else { return .paused }
        if glassesLink == .connected, videoSource == .glasses, isVideoRunning, let lastVideoFrame,
           max(connectionCheckedAt, lastVideoFrame) - lastVideoFrame < timing.frameTimeout {
            return .streaming
        }
        return glassesLink
    }

    func refreshGlassesConnection() {
        guard isForeground else { return }
        glassesLink = video.connectionStatus()
        connectionCheckedAt = now()
        if glassesLink == .notRegistered {
            glassesRegistration = nil
            if isUnpairPending { completeUnpair() }
        }
    }

    private func completeUnpair() {
        isUnpairPending = false
        glassesRegistration = nil
        glassesLink = .notRegistered
        unpairMessage = "TrackInspect is unpaired. You can pair again below."
    }

    func unpair() async {
        guard !isPairing, !isUnpairing, isForeground else { return }
        isUnpairing = true
        isUnpairPending = true
        unpairMessage = "Stopping capture and removing TrackInspect's access…"
        error = nil
        shareFindings = false
        defer { isUnpairing = false }
        await stopAll()
        do {
            try Task.checkCancellation()
            guard isForeground else { throw CancellationError() }
            if try await video.unregister() {
                completeUnpair()
            } else if isUnpairPending {
                unpairMessage = "Finish removing TrackInspect's access in Meta AI, then return here."
                refreshGlassesConnection()
            }
        } catch {
            isUnpairPending = false
            unpairMessage = error is CancellationError
                ? "Unpairing was not confirmed. You can try again."
                : error.localizedDescription
        }
    }
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
    /// Upload the annotated pointing screenshot to Passiv and send its description to the voice agent.
    /// On by default at the owner's request; only effective in builds that carry a Passiv key.
    var describeTargets = true {
        didSet {
            if !describeTargets { cancelDescription() }
        }
    }
    var canDescribeTargets: Bool { describer != nil }
    private(set) var isDescribingTarget = false
    private(set) var analyzedFrames = 0

    /// Source of the current or most recent run; fixed while a run is active.
    private(set) var videoSource = VideoSource.glasses
    private let video: any VideoService
    private let phoneVideo: (any FrameSource)?
    private var activeVideo: any FrameSource {
        videoSource == .phone ? phoneVideo ?? video : video
    }
    private let analyzer: any AnalysisService
    private let voice: any VoiceService
    private let describer: (any TargetDescriptionService)?
    @ObservationIgnored private var describeTask: Task<Void, Never>?
    private var describeGeneration = UUID()
    private var lastDescription = -TimeInterval.infinity
    private var pointingStreak = 0
    private var lastTip: CGPoint?
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

    init(video: any VideoService, phoneVideo: (any FrameSource)? = nil,
         analyzer: any AnalysisService, voice: any VoiceService,
         describer: (any TargetDescriptionService)? = nil,
         timing: SessionTiming = SessionTiming(),
         now: @escaping @MainActor () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.video = video
        self.phoneVideo = phoneVideo
        self.analyzer = analyzer
        self.voice = voice
        self.describer = describer
        self.timing = timing
        self.now = now
        routeTask = Task { [weak self] in
            for await _ in NotificationCenter.default.notifications(named: AVAudioSession.routeChangeNotification) {
                guard !Task.isCancelled else { return }
                self?.refreshRoute()
                self?.holdPhoneAudioIfNeeded()
            }
        }
    }

    // MARK: - Registration and lifecycle

    func pair() async {
        guard !isPairing, !isUnpairing, !isUnpairPending else { return }
        unpairMessage = nil
        isPairing = true
        error = nil
        defer { isPairing = false }
        do {
            glassesRegistration = try await video.register()
        } catch {
            glassesRegistration = nil
            if !(error is CancellationError) { self.error = error.localizedDescription }
        }
    }

    func handle(url: URL) async {
        do {
            if let status = try await video.handle(url: url) {
                glassesRegistration = status
                error = nil
            }
            refreshGlassesConnection()
        } catch {
            if isUnpairPending {
                isUnpairPending = false
                unpairMessage = "Meta could not confirm unpairing. You can try again."
            }
            glassesRegistration = nil
            self.error = error.localizedDescription
        }
    }

    /// Invalidate both pipelines synchronously before the scene leaves the foreground.
    func setForeground(_ active: Bool) {
        isForeground = active
        if !active {
            shareFindings = false
            cancelDescription()
            pointingCapture = nil
            _ = beginStopVideo()
            _ = beginStopVoice()
        } else {
            // Configures the Meta SDK early so the glasses link is up before Start video.
            refreshGlassesConnection()
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

    func startVideo(source: VideoSource = .glasses) {
        guard isForeground, !isUnpairing, !isUnpairPending,
              !isVideoRunning, !isVideoBusy, !isVideoStopping else { return }
        guard source == .glasses || phoneVideo != nil else {
            error = "The iPhone camera is not available in this build."
            return
        }
        videoSource = source
        if source == .glasses, isVoiceRunning {
            keepsPhoneAudio = true
            holdPhoneAudioIfNeeded()
        }
        let video = activeVideo
        video.beforeStream = source == .glasses ? { [weak self] in await self?.routeVoiceToGlasses() } : nil
        error = nil
        cancelAnalysis()
        preview = nil
        pointingCapture = nil
        cancelDescription()
        isVideoRunning = true
        isVideoBusy = true
        videoStatus = source == .phone ? "Starting iPhone camera…" : "Starting glasses…"
        lastFrame = now()
        lastVideoFrame = nil
        lastAnalysis = -.infinity
        let generation = UUID()
        videoGeneration = generation
        bindVideo(video, generation: generation)
        videoTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isVideoBusy = false }
            do {
                try Task.checkCancellation()
                try await video.start()
                try Task.checkCancellation()
                guard self.videoGeneration == generation else { return }
                self.lastFrame = self.now()
                self.watchdog = Task { [weak self, interval = self.timing.watchdogInterval] in
                    while !Task.isCancelled {
                        do { try await Task.sleep(for: interval) } catch { return }
                        guard let self, self.videoGeneration == generation, self.isVideoRunning else { return }
                        if self.now() - self.lastFrame >= self.timing.frameTimeout {
                            let hint = source == .phone
                                ? "Close other apps using the camera and restart video."
                                : "Check glasses connection and stop competing camera/audio apps."
                            self.error = "No video frames for \(Int(self.timing.frameTimeout)) seconds. \(hint)"
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
        lastVideoFrame = nil
        isVideoStopping = true
        videoStatus = "Stopping video…"
        let video = activeVideo
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

    private func bindVideo(_ video: any FrameSource, generation: UUID) {
        video.onFrame = { [weak self] image in
            guard let self, self.videoGeneration == generation, self.isVideoRunning, self.isForeground else { return }
            self.lastFrame = self.now()
            self.lastVideoFrame = self.lastFrame
            self.videoStatus = self.videoSource == .phone ? "Live · iPhone camera" : "Live · Meta Ray-Ban"
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
        guard isForeground, !isUnpairing, !isUnpairPending,
              !isVoiceRunning, !isVoiceBusy, !isVoiceStopping else { return }
        error = nil
        isVoiceRunning = true
        isVoiceBusy = true
        voiceStatus = "Connecting"
        transcript = []
        lastContext = -.infinity
        let generation = UUID()
        voiceGeneration = generation
        bindVoice(generation: generation)
        // The glasses end a running camera session when hands-free audio comes up,
        // so the stream is restarted once the voice route has settled.
        let resumeGlasses = isVideoRunning && !isVideoBusy && videoSource == .glasses
        let videoStop = resumeGlasses ? beginStopVideo() : nil
        voiceTask = Task { [weak self] in
            guard let self else { return }
            defer { self.isVoiceBusy = false }
            do {
                await videoStop?.value
                try Task.checkCancellation()
                try await self.voice.start(agentID: agentID)
                try Task.checkCancellation()
                guard self.voiceGeneration == generation else { return }
                self.refreshRoute()
                if resumeGlasses {
                    self.videoStatus = "Restarting glasses video…"
                    self.isVoiceBusy = false
                    self.keepsPhoneAudio = true
                    self.holdPhoneAudioIfNeeded()
                    try await Task.sleep(for: self.timing.routeSettle)
                    guard self.voiceGeneration == generation else { return }
                    self.refreshRoute()
                    self.startVideo(source: .glasses)
                }
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
        keepsPhoneAudio = false
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

    /// The glasses microphone delivers silence while their camera streams, so voice
    /// stays on the iPhone for as long as glasses video and the agent run together.
    private func holdPhoneAudioIfNeeded() {
        guard keepsPhoneAudio, isVoiceRunning else { return }
        let session = AVAudioSession.sharedInstance()
        guard session.currentRoute.inputs.contains(where: { $0.portType == .bluetoothHFP }),
              let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) else { return }
        try? session.setPreferredInput(mic)
        try? session.overrideOutputAudioPort(.speaker)
        refreshRoute()
    }

    /// Meta's order for glasses microphone plus camera: attach the stream, bring up the
    /// hands-free route, let it settle, then start the stream. Falls back to iPhone audio.
    private func routeVoiceToGlasses() async {
        guard isVoiceRunning else { return }
        let session = AVAudioSession.sharedInstance()
        guard let glasses = session.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) else {
            MetaVideoService.trace("audio: no hands-free input, staying on iPhone")
            return
        }
        keepsPhoneAudio = false
        try? session.setPreferredInput(glasses)
        try? session.overrideOutputAudioPort(.none)
        try? await Task.sleep(for: timing.routeSettle)
        let active = session.currentRoute.inputs.contains { $0.portType == .bluetoothHFP }
        MetaVideoService.trace("audio: hands-free route before stream active=\(active)")
        if !active {
            keepsPhoneAudio = true
            holdPhoneAudioIfNeeded()
        }
        refreshRoute()
    }

    func preferPhoneAudio(_ phone: Bool) {
        guard isVoiceRunning, !isVoiceBusy else { return }
        keepsPhoneAudio = phone
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
        pointingCapture = nil
        cancelDescription()
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
                // A held finger, not a hand passing through or tapping: the tip must stay put across frames.
                if let tip = result.pointing?.tip {
                    let held = self.lastTip.map { hypot($0.x - tip.x, $0.y - tip.y) < 0.1 } ?? false
                    self.pointingStreak = held ? self.pointingStreak + 1 : 1
                    self.lastTip = tip
                } else {
                    self.pointingStreak = 0
                    self.lastTip = nil
                }
                let dwell = self.isVideoRunning ? self.timing.pointingDwellFrames : 1
                if let pointing = result.pointing, let target = result.target,
                   let snapshot = result.snapshot, let image = UIImage(data: snapshot) {
                    let capture = PointingCapture(image: image, pointing: pointing, target: target,
                                                  capturedAt: result.capturedAt)
                    if self.describeTargets, self.describer != nil {
                        if self.pointingStreak >= dwell {
                            self.describeIfDue(capture, snapshot: snapshot, newGesture: self.pointingStreak == dwell)
                        }
                        // The panel keeps a described frame; otherwise it follows the latest pointing frame.
                        if self.describeTask == nil, self.pointingCapture?.description == nil {
                            self.pointingCapture = capture
                        }
                    } else {
                        self.pointingCapture = capture
                    }
                }
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

    private func describeIfDue(_ capture: PointingCapture, snapshot: Data, newGesture: Bool) {
        guard let describer, isForeground, describeTask == nil,
              now() - lastDescription >= (newGesture ? timing.describeMinimum : timing.describeInterval) else { return }
        lastDescription = now()
        pointingCapture = capture
        isDescribingTarget = true
        let generation = describeGeneration
        describeTask = Task { [weak self] in
            defer {
                if let self, self.describeGeneration == generation {
                    self.describeTask = nil
                    self.isDescribingTarget = false
                }
            }
            do {
                let text = try await describer.describe(snapshot: snapshot, hint: capture.target.label?.label)
                guard let self, !Task.isCancelled, self.describeGeneration == generation, self.describeTargets else { return }
                guard !text.uppercased().hasPrefix("NONE") else {
                    self.pointingCapture?.description = "Not a deliberate point. Nothing was sent to the agent."
                    return
                }
                self.pointingCapture?.description = text
                guard self.isVoiceRunning, !self.isVoiceBusy else { return }
                try await self.voice.sendText("I am pointing at this (described by the camera's vision model, unverified): \(text) Briefly acknowledge what I am pointing at.")
            } catch {
                guard let self, !Task.isCancelled, self.describeGeneration == generation else { return }
                self.error = "Could not describe the pointing target: \(error.localizedDescription)"
            }
        }
    }

    private func cancelDescription() {
        describeGeneration = UUID()
        describeTask?.cancel()
        describeTask = nil
        isDescribingTarget = false
        lastDescription = -.infinity
        pointingStreak = 0
        lastTip = nil
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
        describeTask?.cancel()
    }
}
