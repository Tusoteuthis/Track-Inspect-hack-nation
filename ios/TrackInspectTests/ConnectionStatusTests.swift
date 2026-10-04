import XCTest
@preconcurrency import MWDATCore
@testable import TrackInspect

@MainActor private final class ConnectionClock {
    var time: TimeInterval = 100
}

@MainActor final class ConnectionStatusTests: XCTestCase {
    func testRegistrationIsNotConnectivity() {
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .registered, links: []), .disconnected)
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .registered, links: [.disconnected]), .disconnected)
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .available, links: [.connected]), .notRegistered)
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .registering, links: [.connected]), .awaitingApproval)
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .unavailable, links: [.connected]), .unavailable)
    }

    func testLinkSnapshotsDistinguishConnectingAndConnected() {
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .registered, links: [.connecting]), .connecting)
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .registered, links: [.disconnected, .connected]), .connected)
        XCTAssertEqual(MetaVideoService.connectionStatus(registration: .registered, links: [.connecting, .connected]), .connected)
    }

    func testRefreshTracksLinkWithoutStartingCapture() async {
        let video = LifecycleVideo()
        let voice = LifecycleVoice()
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: voice)
        XCTAssertEqual(model.glassesConnection, .checking)
        model.refreshGlassesConnection()
        XCTAssertEqual(model.glassesConnection, .connected)
        video.linkStatus = .disconnected
        model.refreshGlassesConnection()
        XCTAssertEqual(model.glassesConnection, .disconnected)
        XCTAssertEqual(video.startCalls, 0)
        XCTAssertEqual(voice.startCalls, 0)
        model.setForeground(false)
        let checks = video.connectionChecks
        model.refreshGlassesConnection()
        XCTAssertEqual(video.connectionChecks, checks)
        XCTAssertEqual(model.glassesConnection, .paused)
        await model.stopAll()
    }

    func testStreamingRequiresFreshFramesAndResetsOnStop() async throws {
        let clock = ConnectionClock()
        let video = LifecycleVideo()
        let model = InspectionViewModel(video: video, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice(), now: { clock.time })
        model.refreshGlassesConnection()
        model.preview = image() // A photo preview is not a live frame.
        XCTAssertEqual(model.glassesConnection, .connected)
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        XCTAssertEqual(model.glassesConnection, .connected)
        video.onFrame?(image())
        XCTAssertEqual(model.glassesConnection, .streaming)
        clock.time += 100
        model.refreshGlassesConnection()
        XCTAssertEqual(model.glassesConnection, .connected)
        video.onFrame?(image())
        XCTAssertEqual(model.glassesConnection, .streaming)
        video.linkStatus = .disconnected
        model.refreshGlassesConnection()
        XCTAssertEqual(model.glassesConnection, .disconnected)
        await model.stopVideo()
        video.linkStatus = .connected
        model.refreshGlassesConnection()
        XCTAssertEqual(model.glassesConnection, .connected)
        model.startVideo()
        XCTAssertEqual(model.glassesConnection, .connected)
        await model.stopAll()
    }

    func testAllStatesHaveTextAndSymbolsIndependentOfColor() {
        for state in GlassesConnectionStatus.allCases {
            XCTAssertFalse(state.title.isEmpty)
            XCTAssertFalse(state.detail.isEmpty)
            XCTAssertFalse(state.symbol.isEmpty)
        }
    }
}

@MainActor final class PermissionErrorMessageTests: XCTestCase {
    /// Device alerts showed raw codes 0 and 1; pin what they mean in the linked SDK.
    func testRawCodesSeenOnDevice() {
        XCTAssertEqual(PermissionError(rawValue: 0), .noDevice)
        XCTAssertEqual(PermissionError(rawValue: 1), .noDeviceWithConnection)
    }

    func testMessagesAreActionable() {
        XCTAssertTrue(MetaVideoService.message(for: .noDevice).contains("App connections"))
        XCTAssertTrue(MetaVideoService.message(for: .noDeviceWithConnection).contains("not connected"))
    }
}
