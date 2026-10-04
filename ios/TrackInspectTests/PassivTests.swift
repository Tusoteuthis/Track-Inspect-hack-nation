import XCTest
import UIKit
@testable import TrackInspect

final class PassivTests: XCTestCase {
    private let service = PassivVisionService(endpoint: URL(string: "https://gateway.example.test/v1/chat/completions")!,
                                              key: "sk-test", model: "claude-sonnet")

    func testRequestIsOpenAICompatibleWithInlineImage() throws {
        let request = try service.request(snapshot: Data([1, 2, 3]), hint: "bolt")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer sk-test")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["model"] as? String, "claude-sonnet")
        let content = try XCTUnwrap(((body["messages"] as? [[String: Any]])?.first?["content"]) as? [[String: Any]])
        XCTAssertTrue((content[0]["text"] as? String)?.contains("bolt") == true)
        XCTAssertEqual((content[1]["image_url"] as? [String: String])?["url"], "data:image/jpeg;base64,AQID")
    }

    func testDescriptionIsParsedAndEmptyAnswersFail() throws {
        let answer = Data(#"{"choices":[{"message":{"role":"assistant","content":" A rail clip. "}}]}"#.utf8)
        XCTAssertEqual(try PassivVisionService.description(from: answer), "A rail clip.")
        XCTAssertThrowsError(try PassivVisionService.description(from: Data(#"{"choices":[]}"#.utf8)))
        XCTAssertThrowsError(try PassivVisionService.description(from: Data("oops".utf8)))
    }

    func testLargePhotosAreDownscaledBeforeUpload() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let big = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 1500), format: format).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 3000, height: 1500))
        }
        let small = try XCTUnwrap(UIImage(data: PassivVisionService.downscaled(try XCTUnwrap(big.jpegData(compressionQuality: 0.8)))))
        XCTAssertEqual(small.size.width * small.scale, 1024)
        XCTAssertEqual(small.size.height * small.scale, 512)
        let tiny = Data([1, 2, 3])
        XCTAssertEqual(PassivVisionService.downscaled(tiny), tiny)
    }

    func testBuildWithoutKeyHasNoCloudDescriber() {
        XCTAssertNil(PassivVisionService(bundle: Bundle(for: PassivTests.self)))
    }

    @MainActor func testNothingIsUploadedWhenSwitchedOff() async throws {
        let describer = RecordingDescriber()
        let model = makeModel(describer)
        XCTAssertTrue(model.describeTargets)
        model.describeTargets = false
        model.analyzePhoto(frame)
        for _ in 0..<100 where model.pointingCapture == nil { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNotNil(model.pointingCapture)
        let calls = await describer.calls
        XCTAssertEqual(calls, 0)
    }

    @MainActor func testPointingIsDescribedAndSentToTheVoiceAgentAsText() async throws {
        let describer = RecordingDescriber()
        let voice = RecordingVoice()
        var clock: TimeInterval = 100
        let model = makeModel(describer, voice: voice, now: { clock })
        model.startVoice(agentID: "test")
        for _ in 0..<100 where model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }
        model.analyzePhoto(frame)
        for _ in 0..<100 where voice.texts.isEmpty { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(model.pointingCapture?.description, "A rail clip.")
        XCTAssertEqual(voice.texts.count, 1)
        XCTAssertTrue(voice.texts[0].contains("unverified): A rail clip."))
        XCTAssertTrue(voice.contexts.isEmpty)

        // A new photo is a fresh run and is described again.
        clock += 1
        model.analyzePhoto(frame)
        for _ in 0..<100 where model.analysis == nil { try await Task.sleep(for: .milliseconds(10)) }
        try await Task.sleep(for: .milliseconds(50))
        let calls = await describer.calls
        XCTAssertEqual(calls, 2)

        model.setForeground(false)
        XCTAssertNil(model.pointingCapture)
        await model.stopAll()
    }

    @MainActor func testVideoDescribesOnlyAHeldFingerAndSkipsNonPointing() async throws {
        let describer = RecordingDescriber()
        let voice = RecordingVoice()
        let video = IdleVideo()
        var clock: TimeInterval = 100
        let model = InspectionViewModel(video: video, analyzer: SnapshotAnalyzer(snapshot: frame.jpegData(compressionQuality: 0.8)!),
                                        voice: voice, describer: describer, now: { clock })
        model.startVoice(agentID: "test")
        model.startVideo()
        for _ in 0..<100 where model.isVideoBusy || model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }

        video.onFrame?(frame)
        for _ in 0..<100 where model.analyzedFrames < 1 { try await Task.sleep(for: .milliseconds(10)) }
        try await Task.sleep(for: .milliseconds(30))
        var calls = await describer.calls
        XCTAssertEqual(calls, 0, "One frame is a passing hand, not a held point")
        XCTAssertNotNil(model.pointingCapture)

        await describer.answer("NONE")
        clock += 1
        video.onFrame?(frame)
        for _ in 0..<100 where model.pointingCapture?.description == nil { try await Task.sleep(for: .milliseconds(10)) }
        calls = await describer.calls
        XCTAssertEqual(calls, 1)
        XCTAssertTrue(voice.texts.isEmpty, "A hand the model calls non-pointing is not sent to the agent")
        XCTAssertEqual(model.pointingCapture?.description, "Not a deliberate point. Nothing was sent to the agent.")
        await model.stopAll()
    }

    private var frame: UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
    }

    @MainActor private func makeModel(_ describer: RecordingDescriber, voice: RecordingVoice? = nil,
                                      now: @escaping @MainActor () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) -> InspectionViewModel {
        InspectionViewModel(video: IdleVideo(), analyzer: SnapshotAnalyzer(snapshot: frame.jpegData(compressionQuality: 0.8)!),
                            voice: voice ?? RecordingVoice(), describer: describer, now: now)
    }
}

private actor RecordingDescriber: TargetDescriptionService {
    private(set) var calls = 0
    private var text = "A rail clip."
    func answer(_ text: String) { self.text = text }
    func describe(snapshot: Data, hint: String?) async throws -> String {
        calls += 1
        return text
    }
}

private struct SnapshotAnalyzer: AnalysisService {
    let snapshot: Data
    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        AnalysisResult(findings: [], model: "mock", milliseconds: 0, capturedAt: capturedAt,
                       pointing: Pointing(tip: CGPoint(x: 0.2, y: 0.5), heading: CGVector(dx: 0.1, dy: 0),
                                          direction: "right", confidence: 1),
                       target: PointingTarget(box: CGRect(x: 0.5, y: 0.4, width: 0.1, height: 0.2), salient: true),
                       snapshot: snapshot)
    }
}

@MainActor private final class IdleVideo: VideoService {
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

@MainActor private final class RecordingVoice: VoiceService {
    var onStatus: ((String) -> Void)?
    var onTranscript: (([TranscriptLine]) -> Void)?
    var onMuted: ((Bool) -> Void)?
    var contexts: [String] = []
    func start(agentID: String) async throws { onStatus?("Connected") }
    func stop() async {}
    func setMuted(_ muted: Bool) async throws {}
    var texts: [String] = []
    func updateContext(_ text: String) async throws { contexts.append(text) }
    func sendText(_ text: String) async throws { texts.append(text) }
}
