import XCTest
import UIKit
@testable import TrackInspect

final class PointingTests: XCTestCase {
    private let wrist = CGPoint(x: 0.5, y: 0.1)
    private let index = PointingDetector.Finger(mcp: CGPoint(x: 0.5, y: 0.4), pip: CGPoint(x: 0.5, y: 0.55),
                                                tip: CGPoint(x: 0.5, y: 0.8))
    private let curled = PointingDetector.Finger(mcp: CGPoint(x: 0.55, y: 0.4), pip: CGPoint(x: 0.55, y: 0.5),
                                                 tip: CGPoint(x: 0.55, y: 0.42))

    func testExtendedIndexWithCurledFingersPoints() throws {
        let pointing = try XCTUnwrap(PointingDetector.pointing(wrist: wrist, index: index, others: [curled, curled, curled],
                                                               aspect: 1, confidence: 0.9))
        XCTAssertEqual(pointing.direction, "up")
        XCTAssertEqual(pointing.tip.x, 0.5, accuracy: 0.001)
        // Vision's origin is bottom-left; the overlay's is top-left.
        XCTAssertEqual(pointing.tip.y, 0.2, accuracy: 0.001)
        XCTAssertEqual(pointing.confidence, 0.9)
    }

    func testOpenHandIsNotPointing() {
        let extended = PointingDetector.Finger(mcp: CGPoint(x: 0.55, y: 0.4), pip: CGPoint(x: 0.55, y: 0.55),
                                               tip: CGPoint(x: 0.55, y: 0.78))
        XCTAssertNil(PointingDetector.pointing(wrist: wrist, index: index, others: [extended, curled, curled],
                                               aspect: 1, confidence: 1))
    }

    func testCurledIndexIsNotPointing() {
        let bent = PointingDetector.Finger(mcp: index.mcp, pip: index.pip, tip: CGPoint(x: 0.5, y: 0.45))
        XCTAssertNil(PointingDetector.pointing(wrist: wrist, index: bent, others: [curled], aspect: 1, confidence: 1))
    }

    func testDirectionAccountsForImageAspect() {
        let wrist = CGPoint(x: 0.35, y: 0.1)
        let index = PointingDetector.Finger(mcp: CGPoint(x: 0.4, y: 0.3), pip: CGPoint(x: 0.45, y: 0.45),
                                            tip: CGPoint(x: 0.5, y: 0.6))
        XCTAssertEqual(PointingDetector.pointing(wrist: wrist, index: index, others: [], aspect: 1, confidence: 1)?.direction, "up")
        XCTAssertEqual(PointingDetector.pointing(wrist: wrist, index: index, others: [], aspect: 2, confidence: 1)?.direction, "up-right")
    }

    func testHandPoseModelRunsLocallyAndFindsNoHandInBlankImage() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256)).image { context in
            UIColor.gray.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
        }
        let data = try XCTUnwrap(image.jpegData(compressionQuality: 0.8))
        let result = try await LocalAnalysisService().analyze(jpeg: data, capturedAt: .now)
        XCTAssertNil(result.pointing)
    }

    func testContextMentionsPointingOnlyWhenDetectedAndMarksItUnverified() {
        var result = AnalysisResult(findings: [], model: "test", milliseconds: 1, capturedAt: .now)
        XCTAssertFalse(result.context.contains("point"))
        result.pointing = Pointing(tip: .zero, heading: CGVector(dx: -0.1, dy: 0), direction: "left", confidence: 0.8)
        XCTAssertTrue(result.context.contains("point left"))
        XCTAssertTrue(result.context.contains("unverified gesture heuristic"))
        result.target = PointingTarget(box: .zero, salient: true, label: Finding(label: "bolt", confidence: 0.6))
        XCTAssertTrue(result.context.contains("point left at a region locally labelled bolt (60%)"))
    }

    private let right = Pointing(tip: CGPoint(x: 0.2, y: 0.5), heading: CGVector(dx: 0.1, dy: 0),
                                 direction: "right", confidence: 1)

    func testTargetIsNearestBoxAlongTheFingerNotTheHandOrBoxesOffTheRay() {
        let hand = CGRect(x: 0.05, y: 0.3, width: 0.3, height: 0.4)
        let near = CGRect(x: 0.5, y: 0.4, width: 0.1, height: 0.2)
        let far = CGRect(x: 0.8, y: 0.4, width: 0.1, height: 0.2)
        let above = CGRect(x: 0.5, y: 0.0, width: 0.1, height: 0.2)
        let behind = CGRect(x: 0.0, y: 0.45, width: 0.1, height: 0.1)
        let target = PointingDetector.target(for: right, candidates: [far, hand, above, behind, near], aspect: 1)
        XCTAssertEqual(target.box, near)
        XCTAssertTrue(target.salient)
    }

    func testWithoutAHitTargetIsASquareAheadOfTheFingertipInsideTheImage() {
        let target = PointingDetector.target(for: right, candidates: [], aspect: 2)
        XCTAssertFalse(target.salient)
        XCTAssertEqual(target.box.width * 2, target.box.height, accuracy: 0.001)
        XCTAssertEqual(target.box.midY, 0.5, accuracy: 0.001)
        XCTAssertEqual(target.box.minX, 0.2, accuracy: 0.001)
        let edge = Pointing(tip: CGPoint(x: 0.95, y: 0.5), heading: CGVector(dx: 0.1, dy: 0), direction: "right", confidence: 1)
        XCTAssertTrue(CGRect(x: 0, y: 0, width: 1, height: 1).contains(PointingDetector.target(for: edge, candidates: [], aspect: 1).box))
    }

    func testTargetIsLocatedAndPaintedOnTheFrameLocally() async throws {
        let size = CGSize(width: 400, height: 300)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor.red.setFill()
            context.fill(CGRect(x: 250, y: 110, width: 90, height: 80))
        }
        let data = try XCTUnwrap(image.jpegData(compressionQuality: 0.9))
        let (target, snapshot) = try await LocalAnalysisService().target(of: right, in: data)
        XCTAssertTrue(CGRect(x: 0, y: 0, width: 1, height: 1).insetBy(dx: -0.001, dy: -0.001).contains(target.box))
        XCTAssertGreaterThan(target.box.width, 0)
        let painted = try XCTUnwrap(UIImage(data: try XCTUnwrap(snapshot)))
        XCTAssertEqual(painted.size, size)
        XCTAssertNotEqual(snapshot, data)
    }

    @MainActor func testCaptureSurvivesStopAndIsClearedOnBackground() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
        let analyzer = PointingAnalyzer(pointing: right, snapshot: try XCTUnwrap(image.jpegData(compressionQuality: 0.8)))
        let model = InspectionViewModel(video: StubVideo(), analyzer: analyzer, voice: StubVoice())
        model.analyzePhoto(image)
        for _ in 0..<100 where model.pointingCapture == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(model.pointingCapture?.target.label?.label, "bolt")
        await model.stopAll()
        XCTAssertNotNil(model.pointingCapture)
        model.setForeground(false)
        XCTAssertNil(model.pointingCapture)
    }
}

private struct PointingAnalyzer: AnalysisService {
    let pointing: Pointing
    let snapshot: Data
    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        AnalysisResult(findings: [], model: "mock", milliseconds: 0, capturedAt: capturedAt, pointing: pointing,
                       target: PointingTarget(box: CGRect(x: 0.5, y: 0.4, width: 0.1, height: 0.2), salient: true,
                                              label: Finding(label: "bolt", confidence: 0.6)),
                       snapshot: snapshot)
    }
}

@MainActor private final class StubVideo: VideoService {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    func connectionStatus() -> GlassesConnectionStatus { .notRegistered }
    func unregister() async throws -> Bool { true }
    func register() async throws -> GlassesRegistrationStatus { .registered }
    func handle(url: URL) async throws -> GlassesRegistrationStatus? { nil }
    func start() async throws {}
    func stop() async {}
}

@MainActor private final class StubVoice: VoiceService {
    var onStatus: ((String) -> Void)?
    var onTranscript: (([TranscriptLine]) -> Void)?
    var onMuted: ((Bool) -> Void)?
    func start(agentID: String) async throws {}
    func stop() async {}
    func setMuted(_ muted: Bool) async throws {}
    func updateContext(_ text: String) async throws {}
}
