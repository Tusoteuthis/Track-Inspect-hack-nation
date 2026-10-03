import XCTest
import UIKit
@testable import TrackInspect

@MainActor final class LifecycleTests: XCTestCase {
    func testConcurrentStopsJoinSameVideoTeardown() async throws {
        let video = LifecycleVideo()
        video.stopDelay = .milliseconds(150)
        let model = makeModel(video: video)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        let first = Task { await model.stopVideo() }
        try await eventually { video.stopCalls == 1 }
        await model.stopVideo()
        XCTAssertTrue(video.stopFinished, "Every stop caller must await the same teardown")
        XCTAssertEqual(video.stopCalls, 1)
        await first.value
    }

    func testStartIsIgnoredDuringVideoTeardownThenWorksAfterCompletion() async throws {
        let video = LifecycleVideo()
        video.stopDelay = .milliseconds(80)
        let model = makeModel(video: video)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        let stop = Task { await model.stopVideo() }
        try await eventually { model.isVideoStopping }
        model.startVideo()
        XCTAssertEqual(video.startCalls, 1)
        await stop.value
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        XCTAssertEqual(video.startCalls, 2)
        await model.stopAll()
    }

    func testOldVideoCallbacksCannotPublishIntoNewRun() async throws {
        let video = LifecycleVideo()
        let model = makeModel(video: video)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        let oldFrame = video.onFrame
        let oldFailure = video.onFailure
        let oldStatus = video.onStatus
        await model.stopVideo()
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        oldFrame?(image())
        oldStatus?("Stale")
        oldFailure?("Old failure")
        XCTAssertNil(model.preview)
        XCTAssertNil(model.error)
        XCTAssertNotEqual(model.videoStatus, "Stale")
        await model.stopAll()
    }

    func testBackgroundStartsVoiceShutdownWithoutWaitingForVideo() async throws {
        let video = LifecycleVideo()
        video.stopDelay = .milliseconds(180)
        let voice = LifecycleVoice()
        let model = makeModel(video: video, voice: voice)
        model.startVideo()
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVideoBusy && !model.isVoiceBusy }
        let stop = Task { await model.stopAll() }
        try await eventually { video.stopCalls > 0 }
        try await Task.sleep(for: .milliseconds(30))
        XCTAssertGreaterThan(voice.stopCalls, 0, "Microphone shutdown must not wait for video cleanup")
        XCTAssertFalse(model.isVoiceRunning)
        await stop.value
    }

    func testConcurrentVoiceStopsJoinTeardown() async throws {
        let voice = LifecycleVoice()
        voice.stopDelay = .milliseconds(100)
        let model = makeModel(voice: voice)
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        let first = Task { await model.stopVoice() }
        try await eventually { voice.stopCalls == 1 }
        await model.stopVoice()
        XCTAssertTrue(voice.stopFinished)
        XCTAssertEqual(voice.stopCalls, 1)
        await first.value
    }

    func testActiveVoiceFailureEndsConversationAndAllowsRetry() async throws {
        let voice = LifecycleVoice()
        let model = makeModel(voice: voice)
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        voice.onStatus?("Error: network lost")
        try await eventually { !model.isVoiceStopping }
        XCTAssertFalse(model.isVoiceRunning)
        XCTAssertTrue(model.isMuted)
        XCTAssertEqual(model.error, "Error: network lost")
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        XCTAssertTrue(model.isVoiceRunning)
        XCTAssertNil(model.error)
        await model.stopAll()
    }

    func testVoiceStartCancellationAndRepeatedStop() async throws {
        let voice = LifecycleVoice()
        voice.startDelay = .seconds(30)
        let model = makeModel(voice: voice)
        model.startVoice(agentID: "agent")
        try await eventually { voice.startCalls == 1 }
        await model.stopVoice()
        await model.stopVoice()
        XCTAssertFalse(model.isVoiceRunning)
        XCTAssertFalse(model.isVoiceBusy)
        XCTAssertTrue(model.isMuted)
        XCTAssertNil(model.error)
    }

    func testVoiceFailureAndLateCallbacksAreIgnoredAfterStop() async throws {
        let voice = LifecycleVoice()
        voice.failStart = true
        let model = makeModel(voice: voice)
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy && !model.isVoiceStopping }
        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.isVoiceRunning)
        voice.failStart = false
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        let oldTranscript = voice.onTranscript
        let oldStatus = voice.onStatus
        await model.stopVoice()
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        oldTranscript?([.init(id: "old", speaker: "agent", text: "stale")])
        oldStatus?("Error: old call")
        XCTAssertTrue(model.transcript.isEmpty)
        XCTAssertNil(model.error)
        await model.stopAll()
    }

    func testRepeatedPhotosNeverQueueUnboundedInference() async throws {
        let analyzer = ControlledAnalyzer()
        let model = makeModel(analyzer: analyzer)
        model.analyzePhoto(image())
        try await eventuallyAsync { await analyzer.calls == 1 }
        for _ in 0..<20 { model.analyzePhoto(image()) }
        try await Task.sleep(for: .milliseconds(30))
        let count = await analyzer.calls
        XCTAssertEqual(count, 1, "Cancelled synchronous inference still owns its slot")
        await model.stopAll()
        await analyzer.releaseAll()
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertNil(model.analysis)
        XCTAssertNil(model.preview)
    }

    func testStopClearsPreviewBeforeSlowSDKTeardown() async throws {
        let video = LifecycleVideo()
        video.stopDelay = .milliseconds(100)
        let model = makeModel(video: video)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        video.onFrame?(image())
        XCTAssertNotNil(model.preview)
        let stop = Task { await model.stopVideo() }
        try await eventually { video.stopCalls == 1 }
        XCTAssertNil(model.preview)
        XCTAssertNil(model.analysis)
        await stop.value
    }

    private func makeModel(video: LifecycleVideo = LifecycleVideo(), analyzer: any AnalysisService = ImmediateAnalyzer(), voice: LifecycleVoice = LifecycleVoice()) -> InspectionViewModel {
        InspectionViewModel(video: video, analyzer: analyzer, voice: voice)
    }
}

@MainActor func eventually(_ predicate: () -> Bool, file: StaticString = #filePath, line: UInt = #line) async throws {
    for _ in 0..<200 {
        if predicate() { return }
        try await Task.sleep(for: .milliseconds(5))
    }
    XCTFail("Condition did not become true", file: file, line: line)
    throw AppFailure(message: "Test timeout")
}

@MainActor func eventuallyAsync(_ predicate: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async throws {
    for _ in 0..<200 {
        if await predicate() { return }
        try await Task.sleep(for: .milliseconds(5))
    }
    XCTFail("Async condition did not become true", file: file, line: line)
    throw AppFailure(message: "Test timeout")
}

@MainActor func image() -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32)).image { context in
        UIColor.blue.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
    }
}

@MainActor final class LifecycleVideo: VideoService {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    var startCalls = 0
    var stopCalls = 0
    var stopFinished = false
    var stopDelay: Duration = .zero
    func register() async throws {}
    func handle(url: URL) async throws {}
    func start() async throws {
        startCalls += 1
        stopFinished = false
        try Task.checkCancellation()
    }
    func stop() async {
        stopCalls += 1
        try? await Task.sleep(for: stopDelay)
        stopFinished = true
    }
}

@MainActor final class LifecycleVoice: VoiceService {
    var onStatus: ((String) -> Void)?
    var onTranscript: (([TranscriptLine]) -> Void)?
    var onMuted: ((Bool) -> Void)?
    var startCalls = 0
    var stopCalls = 0
    var failStart = false
    var startDelay: Duration = .zero
    var stopDelay: Duration = .zero
    var stopFinished = false
    var contextDelay: Duration = .zero
    var contexts: [String] = []
    var contextAttempts = 0
    var contextCancelled = false
    func start(agentID: String) async throws {
        startCalls += 1
        try await Task.sleep(for: startDelay)
        if failStart { throw AppFailure(message: "Agent unavailable") }
        onStatus?("Connected")
        onMuted?(false)
    }
    func stop() async {
        stopCalls += 1
        try? await Task.sleep(for: stopDelay)
        stopFinished = true
        onStatus?("Idle")
        onMuted?(true)
    }
    func setMuted(_ muted: Bool) async throws { onMuted?(muted) }
    func updateContext(_ text: String) async throws {
        contextAttempts += 1
        do {
            try await Task.sleep(for: contextDelay)
            try Task.checkCancellation()
            contexts.append(text)
        } catch {
            contextCancelled = true
            throw error
        }
    }
}

actor ImmediateAnalyzer: AnalysisService {
    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        .init(findings: [.init(label: "railroad", confidence: 0.8)], model: "test", milliseconds: 1, capturedAt: capturedAt)
    }
}

actor ControlledAnalyzer: AnalysisService {
    var calls = 0
    private var pending: [CheckedContinuation<Void, Never>] = []
    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        calls += 1
        let number = calls
        // Deliberately ignores cancellation like a synchronous framework operation.
        await withCheckedContinuation { pending.append($0) }
        return .init(findings: [.init(label: "result-\(number)", confidence: 1)], model: "test", milliseconds: 1, capturedAt: capturedAt)
    }
    func releaseAll() {
        let old = pending
        pending.removeAll()
        for continuation in old { continuation.resume() }
    }
}
