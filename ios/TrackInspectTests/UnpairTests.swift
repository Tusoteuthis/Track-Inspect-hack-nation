import XCTest
@preconcurrency import MWDATCore
@testable import TrackInspect

@MainActor final class UnpairTests: XCTestCase {
    func testAlreadyUnregisteredIsIdempotent() async throws {
        var calls = 0
        let existing = try await MetaRegistrationFlow.unregister(state: { .available }) { calls += 1 }
        XCTAssertTrue(existing)
        XCTAssertEqual(calls, 0)
        let race = try await MetaRegistrationFlow.unregister(state: { .registered }) {
            throw UnregistrationError.alreadyUnregistered
        }
        XCTAssertTrue(race)
    }

    func testHandoffIsNotConfirmedRemoval() async throws {
        let pending = try await MetaRegistrationFlow.unregister(state: { .registered }) {}
        XCTAssertFalse(pending)
        let unknown = try await MetaRegistrationFlow.unregister(state: { .unavailable }) {}
        XCTAssertFalse(unknown)
        var state = RegistrationState.registered
        let complete = try await MetaRegistrationFlow.unregister(state: { state }) { state = .available }
        XCTAssertTrue(complete)
    }

    func testRealErrorsRemainFailures() async {
        for failure in [UnregistrationError.configurationInvalid, .metaAINotInstalled, .unknown] {
            do {
                _ = try await MetaRegistrationFlow.unregister(state: { .registered }) { throw failure }
                XCTFail("Expected removal failure")
            } catch {
                XCTAssertTrue(error is AppFailure)
                XCTAssertFalse(error.localizedDescription.contains("operation couldn’t be completed"))
            }
        }
    }

    func testStopsBothPipelinesBeforeRemovalAndAllowsRePair() async throws {
        let video = LifecycleVideo()
        let voice = LifecycleVoice()
        voice.stopDelay = .milliseconds(50)
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: voice)
        await model.pair()
        model.startVideo()
        model.startVoice(agentID: "test")
        try await eventually { !model.isVideoBusy && !model.isVoiceBusy }
        let unpair = Task { await model.unpair() }
        try await eventually { model.isUnpairing }
        await model.unpair()
        await model.pair()
        model.startVideo()
        model.startVoice(agentID: "test")
        XCTAssertEqual(video.unregisterCalls, 0) // Still waiting for voice shutdown.
        await unpair.value
        XCTAssertTrue(voice.stopFinished)
        XCTAssertTrue(video.stoppedBeforeUnregister)
        XCTAssertEqual(video.unregisterCalls, 1)
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertFalse(model.isVoiceRunning)
        XCTAssertNil(model.glassesRegistration)
        XCTAssertEqual(model.glassesConnection, .notRegistered)
        XCTAssertFalse(model.isUnpairPending)
        await model.pair()
        XCTAssertEqual(model.glassesRegistration, .registered)
    }

    func testPendingRemovalReconcilesWithConnectionRefresh() async {
        let video = LifecycleVideo()
        video.unregisterResult = false
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        await model.pair()
        await model.unpair()
        XCTAssertTrue(model.isUnpairPending)
        XCTAssertEqual(model.glassesRegistration, .registered)
        model.startVideo()
        XCTAssertFalse(model.isVideoRunning)
        video.linkStatus = .notRegistered
        model.refreshGlassesConnection()
        XCTAssertFalse(model.isUnpairPending)
        XCTAssertNil(model.glassesRegistration)
    }

    func testFailurePreservesRegistrationAndAllowsRetry() async {
        let video = LifecycleVideo()
        video.unregisterFailure = true
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        await model.pair()
        await model.unpair()
        XCTAssertEqual(model.glassesRegistration, .registered)
        XCTAssertEqual(model.unpairMessage, "Test removal failed")
        XCTAssertFalse(model.isUnpairing)
        XCTAssertFalse(model.isUnpairPending)
        video.unregisterFailure = false
        await model.unpair()
        XCTAssertNil(model.glassesRegistration)
        XCTAssertEqual(video.unregisterCalls, 2)
    }
}
