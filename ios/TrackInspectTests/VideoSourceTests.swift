import XCTest
import UIKit
@testable import TrackInspect

@MainActor final class VideoSourceTests: XCTestCase {
    func testPhoneSourceUsesPhoneCameraAndNeverStartsGlasses() async throws {
        let glasses = LifecycleVideo()
        let phone = PhoneFeed()
        let model = InspectionViewModel(video: glasses, phoneVideo: phone, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        model.startVideo(source: .phone)
        try await eventually { !model.isVideoBusy }
        XCTAssertEqual(phone.startCalls, 1)
        XCTAssertEqual(glasses.startCalls, 0)
        phone.onFrame?(image())
        XCTAssertNotNil(model.preview)
        XCTAssertEqual(model.videoStatus, "Live · iPhone camera")
        model.refreshGlassesConnection()
        XCTAssertEqual(model.glassesConnection, .connected, "Phone frames are not evidence of glasses streaming")
        await model.stopVideo()
        XCTAssertEqual(phone.stopCalls, 1)
        XCTAssertEqual(glasses.stopCalls, 0)
        XCTAssertNil(phone.onFrame)
        XCTAssertNil(model.preview)
    }

    func testBackgroundStopsPhoneCamera() async throws {
        let phone = PhoneFeed()
        let model = InspectionViewModel(video: LifecycleVideo(), phoneVideo: phone, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        model.startVideo(source: .phone)
        try await eventually { !model.isVideoBusy }
        model.setForeground(false)
        try await eventually { phone.stopCalls == 1 && !model.isVideoStopping }
        XCTAssertFalse(model.isVideoRunning)
    }

    func testGlassesRemainDefaultAndSourcesCanAlternate() async throws {
        let glasses = LifecycleVideo()
        let phone = PhoneFeed()
        let model = InspectionViewModel(video: glasses, phoneVideo: phone, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        model.startVideo()
        try await eventually { !model.isVideoBusy }
        XCTAssertEqual(glasses.startCalls, 1)
        await model.stopVideo()
        model.startVideo(source: .phone)
        try await eventually { !model.isVideoBusy }
        XCTAssertEqual(phone.startCalls, 1)
        XCTAssertEqual(glasses.startCalls, 1)
        await model.stopAll()
    }

    func testPhoneSourceWithoutCameraServiceReportsError() {
        let glasses = LifecycleVideo()
        let model = InspectionViewModel(video: glasses, analyzer: ImmediateAnalyzer(), voice: LifecycleVoice())
        model.startVideo(source: .phone)
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertNotNil(model.error)
        XCTAssertEqual(glasses.startCalls, 0)
    }
}

@MainActor private final class PhoneFeed: FrameSource {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    var startCalls = 0
    var stopCalls = 0
    func start() async throws { startCalls += 1 }
    func stop() async { stopCalls += 1 }
}
