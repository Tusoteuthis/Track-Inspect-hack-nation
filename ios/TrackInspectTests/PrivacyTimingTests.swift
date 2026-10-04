import XCTest
@testable import TrackInspect

@MainActor final class PrivacyTimingTests: XCTestCase {
    func testContextIsRateLimitedWithMonotonicTime() async throws {
        let clock = TestClock()
        let voice = LifecycleVoice()
        let model = makeModel(voice: voice, clock: clock)
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        model.shareFindings = true
        model.analyzePhoto(image())
        try await eventually { voice.contexts.count == 1 }
        clock.time = 4.99
        model.analyzePhoto(image())
        try await eventually { model.analyzedFrames == 2 }
        XCTAssertEqual(voice.contextAttempts, 1)
        clock.time = 5
        model.analyzePhoto(image())
        try await eventually { voice.contexts.count == 2 }
        XCTAssertEqual(voice.contextAttempts, 2)
        await model.stopAll()
    }

    func testOptOutCancelsPendingContextWithoutShowingError() async throws {
        let voice = LifecycleVoice()
        voice.contextDelay = .seconds(30)
        let model = makeModel(voice: voice)
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        model.shareFindings = true
        model.analyzePhoto(image())
        try await eventually { voice.contextAttempts == 1 }
        model.shareFindings = false
        try await eventually { voice.contextCancelled }
        model.analyzePhoto(image())
        try await eventually { model.analyzedFrames == 2 }
        XCTAssertEqual(voice.contextAttempts, 1)
        XCTAssertTrue(voice.contexts.isEmpty)
        XCTAssertNil(model.error)
        await model.stopAll()
    }

    func testSlowContextSendNeverQueuesAnotherSend() async throws {
        let voice = LifecycleVoice()
        voice.contextDelay = .seconds(30)
        let clock = TestClock()
        let model = makeModel(voice: voice, clock: clock)
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVoiceBusy }
        model.shareFindings = true
        model.analyzePhoto(image())
        try await eventually { voice.contextAttempts == 1 }
        for index in 2...6 {
            clock.time += 10
            model.analyzePhoto(image())
            try await eventually { model.analyzedFrames == index }
        }
        XCTAssertEqual(voice.contextAttempts, 1)
        await model.stopVoice()
        XCTAssertTrue(voice.contextCancelled)
        XCTAssertFalse(model.isVoiceRunning)
        await model.stopVideo()
    }

    func testBackgroundInvalidatesBothStartsAndDoesNotAutoResume() async throws {
        let video = LifecycleVideo()
        let voice = LifecycleVoice()
        voice.startDelay = .seconds(30)
        let model = makeModel(video: video, voice: voice)
        model.startVideo()
        model.startVoice(agentID: "agent")
        model.shareFindings = true
        try await eventually { voice.startCalls == 1 }
        model.setForeground(false)
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertFalse(model.isVoiceRunning)
        XCTAssertFalse(model.shareFindings)
        model.startVideo()
        model.startVoice(agentID: "agent")
        try await eventually { !model.isVideoStopping && !model.isVoiceStopping }
        XCTAssertEqual(video.startCalls, 1)
        XCTAssertEqual(voice.startCalls, 1)
        XCTAssertNil(model.error)
        model.setForeground(true)
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertFalse(model.isVoiceRunning)
    }

    func testNoFrameWatchdogStopsStreamAndAllowsExplicitRetry() async throws {
        let clock = TestClock()
        let video = LifecycleVideo()
        let timing = SessionTiming(watchdogInterval: .milliseconds(5))
        let model = makeModel(video: video, clock: clock, timing: timing)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        clock.time = 13
        try await eventually { !model.isVideoRunning && !model.isVideoStopping }
        XCTAssertTrue(model.error?.contains("No video frames") == true)
        XCTAssertNil(model.preview)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        XCTAssertEqual(video.startCalls, 2)
        await model.stopAll()
    }

    func testRecentFramesResetWatchdogAndInferenceSamplingDropsBusyFrames() async throws {
        let clock = TestClock()
        let video = LifecycleVideo()
        let analyzer = ControlledAnalyzer()
        let model = InspectionViewModel(video: video, analyzer: analyzer, voice: LifecycleVoice(),
                                        timing: SessionTiming(watchdogInterval: .milliseconds(5)), now: { clock.time })
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        video.onFrame?(image())
        try await eventuallyAsync { await analyzer.calls == 1 }
        clock.time = 11
        for _ in 0..<50 { video.onFrame?(image()) }
        clock.time = 13
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertTrue(model.isVideoRunning)
        let count = await analyzer.calls
        XCTAssertEqual(count, 1)
        await model.stopAll()
        await analyzer.releaseAll()
    }

    func testCancelledOldInferenceCannotPublishAfterVideoRestart() async throws {
        let video = LifecycleVideo()
        let analyzer = ControlledAnalyzer()
        let model = InspectionViewModel(video: video, analyzer: analyzer, voice: LifecycleVoice(), timing: SessionTiming(analysisInterval: 0))
        model.analyzePhoto(image())
        try await eventuallyAsync { await analyzer.calls == 1 }
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        video.onFrame?(image())
        await analyzer.releaseAll()
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertNil(model.analysis)
        video.onFrame?(image())
        try await eventuallyAsync { await analyzer.calls == 2 }
        await analyzer.releaseAll()
        try await eventually { model.analysis != nil }
        XCTAssertEqual(model.analysis?.findings.first?.label, "result-2")
        await model.stopAll()
    }

    func testLatestPhotoReplacesPendingPhotoWithoutStartingParallelInference() async throws {
        let analyzer = ControlledAnalyzer()
        let model = InspectionViewModel(video: LifecycleVideo(), analyzer: analyzer, voice: LifecycleVoice())
        model.analyzePhoto(image())
        try await eventuallyAsync { await analyzer.calls == 1 }
        for _ in 0..<10 { model.analyzePhoto(image()) }
        await analyzer.releaseAll()
        try await eventuallyAsync { await analyzer.calls == 2 }
        XCTAssertNil(model.analysis)
        await analyzer.releaseAll()
        try await eventually { model.analysis != nil }
        XCTAssertEqual(model.analyzedFrames, 1)
        XCTAssertEqual(model.analysis?.findings.first?.label, "result-2")
        await model.stopAll()
    }

    func testStartingVoiceRestartsStreamingGlassesVideoAfterRouteSettles() async throws {
        let video = LifecycleVideo()
        let voice = LifecycleVoice()
        var timing = SessionTiming()
        timing.routeSettle = .milliseconds(10)
        let model = makeModel(video: video, voice: voice, timing: timing)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        model.startVoice(agentID: "agent")
        try await eventually { video.startCalls == 2 && !model.isVideoBusy }
        XCTAssertGreaterThan(video.stopCalls, 0)
        XCTAssertEqual(voice.startCalls, 1)
        XCTAssertTrue(model.isVideoRunning)
        XCTAssertTrue(model.isVoiceRunning)
        XCTAssertNil(model.error)
        await model.stopAll()
    }

    func testBundleIdentityAndCallbackConfiguration() {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "ai.trackinspect.app")
        let dat = Bundle.main.object(forInfoDictionaryKey: "MWDAT") as? [String: Any]
        XCTAssertEqual(dat?["AppLinkURLScheme"] as? String, "trackinspect://")
        // The glasses link needs the accessory modes; capture modes must stay absent.
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        XCTAssertEqual(Set(modes), ["bluetooth-central", "bluetooth-peripheral", "external-accessory"])
    }

    private func makeModel(video: LifecycleVideo = LifecycleVideo(), voice: LifecycleVoice = LifecycleVoice(), clock: TestClock = TestClock(), timing: SessionTiming = SessionTiming()) -> InspectionViewModel {
        InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: voice, timing: timing, now: { clock.time })
    }
}

@MainActor private final class TestClock {
    var time: TimeInterval = 0
}
