import XCTest
import UIKit
@testable import TrackInspect

final class InspectionTests: XCTestCase {
    func testContextLabelsUnverifiedAndIncludesConfidence() {
        let result = AnalysisResult(findings: [.init(label: "railroad", confidence: 0.75)], model: "test", milliseconds: 1, capturedAt: .now)
        XCTAssertTrue(result.context.contains("railroad (75%)"))
        XCTAssertTrue(result.context.contains("not a safety assessment"))
    }

    @MainActor func testPhotoAnalyzesWithoutStartingCapture() async throws {
        let video = MockVideo()
        let model = InspectionViewModel(video: video, analyzer: MockAnalyzer(), voice: MockVoice())
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
        model.analyzePhoto(image)
        for _ in 0..<100 where model.analysis == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(model.analysis?.findings.first?.label, "test")
        XCTAssertFalse(video.started)
        XCTAssertFalse(model.shareFindings)
        await model.stopAll()
        XCTAssertNil(model.preview)
        XCTAssertNil(model.analysis)
    }

    @MainActor func testStopCancelsInFlightVideoStart() async throws {
        let video = MockVideo()
        video.delayStart = true
        let model = InspectionViewModel(video: video, analyzer: MockAnalyzer(), voice: MockVoice())
        model.startVideo()
        await model.stopVideo()
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertFalse(model.isVideoBusy)
        XCTAssertFalse(model.isVideoStopping)
        XCTAssertFalse(video.started)
        XCTAssertNil(model.error)
    }

    @MainActor func testFindingsAreNotSharedWithoutConsent() async throws {
        let voice = MockVoice()
        let model = InspectionViewModel(video: MockVideo(), analyzer: MockAnalyzer(), voice: voice)
        model.startVoice(agentID: "test")
        for _ in 0..<100 where model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.blue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
        model.analyzePhoto(image)
        for _ in 0..<100 where model.analysis == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(voice.contexts.isEmpty)
        model.shareFindings = true
        model.analyzePhoto(image)
        for _ in 0..<100 where voice.contexts.isEmpty { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(voice.contexts.count, 1)
        await model.stopAll()
    }

    @MainActor func testBuiltInVisionModelRunsLocally() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256)).image { context in
            UIColor.green.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
        }
        let data = try XCTUnwrap(image.jpegData(compressionQuality: 0.8))
        let result = try await LocalAnalysisService().analyze(jpeg: data, capturedAt: .now)
        XCTAssertEqual(result.model, "Apple Vision · general classifier")
        XCTAssertLessThanOrEqual(result.findings.count, 5)
    }

    @MainActor func testStartFailureResetsVideoState() async throws {
        let video = MockVideo()
        video.fail = true
        let model = InspectionViewModel(video: video, analyzer: MockAnalyzer(), voice: MockVoice())
        model.startVideo()
        for _ in 0..<100 where model.isVideoBusy { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertFalse(model.isVideoRunning)
        XCTAssertNotNil(model.error)
        await model.stopAll()
    }
}

@MainActor private final class MockVideo: VideoService {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    var started = false
    var fail = false
    var delayStart = false
    func connectionStatus() -> GlassesConnectionStatus { .notRegistered }
    func unregister() async throws -> Bool { true }
    func register() async throws -> GlassesRegistrationStatus { .registered }
    func handle(url: URL) async throws -> GlassesRegistrationStatus? { nil }
    func start() async throws {
        if delayStart { try await Task.sleep(for: .seconds(30)) }
        try Task.checkCancellation()
        if fail { throw AppFailure(message: "Test failure") }
        started = true
    }
    func stop() async { started = false }
}

private actor MockAnalyzer: AnalysisService {
    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        .init(findings: [.init(label: "test", confidence: 1)], model: "mock", milliseconds: 0, capturedAt: capturedAt)
    }
}

@MainActor private final class MockVoice: VoiceService {
    var onStatus: ((String) -> Void)?
    var onTranscript: (([TranscriptLine]) -> Void)?
    var onMuted: ((Bool) -> Void)?
    func start(agentID: String) async throws { onStatus?("Connected") }
    func stop() async {}
    func setMuted(_ muted: Bool) async throws { onMuted?(muted) }
    var contexts: [String] = []
    func updateContext(_ text: String) async throws { contexts.append(text) }
}
