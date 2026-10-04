import XCTest
import UIKit
@preconcurrency import MWDATCore
@testable import TrackInspect

@MainActor final class RegistrationTests: XCTestCase {
    func testScreenshotErrorZeroMeansAlreadyRegistered() {
        XCTAssertEqual(RegistrationError.alreadyRegistered.rawValue, 0)
    }

    func testRegisteredStateDoesNotStartRegistrationAgain() async throws {
        var calls = 0
        let result = try await MetaRegistrationFlow.begin(state: { .registered }) { calls += 1 }
        XCTAssertEqual(result, .registered)
        XCTAssertEqual(calls, 0)
    }

    func testAlreadyRegisteredRaceIsSuccess() async throws {
        let result = try await MetaRegistrationFlow.begin(state: { .available }) {
            throw RegistrationError.alreadyRegistered
        }
        XCTAssertEqual(result, .registered)
    }

    func testRegisteringStateDoesNotStartDuplicateHandoff() async throws {
        var calls = 0
        let result = try await MetaRegistrationFlow.begin(state: { .registering }) { calls += 1 }
        XCTAssertEqual(result, .awaitingApproval)
        XCTAssertEqual(calls, 0)
    }

    func testNewRegistrationRemainsPendingUntilSDKConfirmsIt() async throws {
        let pending = try await MetaRegistrationFlow.begin(state: { .available }) {}
        XCTAssertEqual(pending, .awaitingApproval)
        var state = RegistrationState.available
        let completed = try await MetaRegistrationFlow.begin(state: { state }) { state = .registered }
        XCTAssertEqual(completed, .registered)
    }

    func testRealRegistrationErrorsAreActionable() async {
        let cases: [(RegistrationError, String)] = [
            (.configurationInvalid, "configuration"),
            (.metaAINotInstalled, "Meta AI"),
            (.networkUnavailable, "internet"),
            (.unknown, "try again")
        ]
        for (failure, expected) in cases {
            do {
                _ = try await MetaRegistrationFlow.begin(state: { .available }) { throw failure }
                XCTFail("Real failure must not be treated as success")
            } catch {
                XCTAssertTrue(error.localizedDescription.contains(expected), error.localizedDescription)
                XCTAssertFalse(error.localizedDescription.contains("operation couldn’t be completed"))
            }
        }
    }

    func testUnconsumedCallbackDoesNotReportRegistration() async throws {
        let result = try await MetaRegistrationFlow.consumeCallback(state: { .registered }) { false }
        XCTAssertNil(result)
    }

    func testConsumedCallbackUsesConfirmedSDKState() async throws {
        let result = try await MetaRegistrationFlow.consumeCallback(state: { .registered }) { true }
        XCTAssertEqual(result, .registered)
        let unconfirmed = try await MetaRegistrationFlow.consumeCallback(state: { .available }) { true }
        XCTAssertNil(unconfirmed)
    }

    func testCallbackFailureIsNotHiddenByExistingRegistration() async {
        do {
            _ = try await MetaRegistrationFlow.consumeCallback(state: { .registered }) {
                throw WearablesHandleURLError.registrationError
            }
            XCTFail("Callback failure must remain visible")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("Meta AI could not complete registration"))
        }
    }

    func testOnlyConfirmedSDKStateBecomesRegistered() {
        XCTAssertEqual(MetaRegistrationFlow.status(for: .registered), .registered)
        XCTAssertEqual(MetaRegistrationFlow.status(for: .registering), .awaitingApproval)
        XCTAssertNil(MetaRegistrationFlow.status(for: .available))
        XCTAssertNil(MetaRegistrationFlow.status(for: .unavailable))
    }

    func testPairingFeedbackSurvivesBackgroundAndDoesNotStartCapture() async throws {
        let video = RegistrationVideo()
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        model.error = "Old error"
        await model.pair()
        XCTAssertNil(model.error)
        XCTAssertEqual(model.glassesRegistration, .registered)
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertEqual(video.streamStarts, 0)
        model.setForeground(false)
        await model.stopAll()
        XCTAssertEqual(model.glassesRegistration, .registered)
        XCTAssertFalse(model.isVoiceRunning)
    }

    func testOverlappingPairRequestsAreCoalescedAndRetryWorks() async throws {
        let video = RegistrationVideo()
        video.delay = .milliseconds(80)
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        let first = Task { await model.pair() }
        try await eventually { model.isPairing }
        await model.pair()
        XCTAssertEqual(video.registrationCalls, 1)
        await first.value
        XCTAssertFalse(model.isPairing)
        await model.pair()
        XCTAssertEqual(video.registrationCalls, 2)
    }

    func testPairFailureIsNotReportedAsRegisteredAndCanRetry() async {
        let video = RegistrationVideo()
        video.fail = true
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        await model.pair()
        XCTAssertNil(model.glassesRegistration)
        XCTAssertNotNil(model.error)
        XCTAssertFalse(model.isPairing)
        video.fail = false
        await model.pair()
        XCTAssertNil(model.error)
        XCTAssertEqual(model.glassesRegistration, .registered)
    }

    func testCallbackUpdatesOnlyWhenServiceReturnsStatus() async {
        let video = RegistrationVideo()
        video.result = .awaitingApproval
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        await model.pair()
        XCTAssertEqual(model.glassesRegistration, .awaitingApproval)
        await model.handle(url: URL(string: "https://example.invalid")!)
        XCTAssertEqual(model.glassesRegistration, .awaitingApproval)
        await model.handle(url: URL(string: "trackinspect://callback")!)
        XCTAssertEqual(model.glassesRegistration, .registered)
        XCTAssertFalse(model.isVideoRunning)
    }
}

@MainActor private final class RegistrationVideo: VideoService {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    var registrationCalls = 0
    var streamStarts = 0
    var delay: Duration = .zero
    var fail = false
    var result = GlassesRegistrationStatus.registered
    func connectionStatus() -> GlassesConnectionStatus {
        result == .registered ? .disconnected : .awaitingApproval
    }
    func unregister() async throws -> Bool { true }
    func register() async throws -> GlassesRegistrationStatus {
        registrationCalls += 1
        try await Task.sleep(for: delay)
        if fail { throw AppFailure(message: "Test pairing failure") }
        return result
    }
    func handle(url: URL) async throws -> GlassesRegistrationStatus? {
        guard url.scheme == "trackinspect" else { return nil }
        result = .registered
        return .registered
    }
    func start() async throws { streamStarts += 1 }
    func stop() async {}
}
