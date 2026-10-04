import XCTest
import UIKit
@testable import TrackInspect

final class VoiceConnectionTests: XCTestCase {
    func testTokenRequestTargetsTheBackendRouteWithBearerAuth() {
        let request = BackendConversationTokens(base: URL(string: "https://backend.example.test")!, accessToken: "secret")
            .request(flow: "tutor")
        XCTAssertEqual(request.url?.absoluteString, "https://backend.example.test/api/conversation-token?flow=tutor")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret")
        XCTAssertNil(BackendConversationTokens(bundle: Bundle(for: VoiceConnectionTests.self)))
    }

    @MainActor func testDirectStartsWithTheAgentID() async throws {
        let voice = ConnectionVoice()
        let model = InspectionViewModel(video: QuietVideo(), analyzer: NoAnalyzer(), voice: voice, voiceTokens: FixedTokens())
        model.startVoice(agentID: "agent-1")
        for _ in 0..<100 where model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(voice.starts, ["agent:agent-1"])
        await model.stopAll()
    }

    @MainActor func testBackendStartsWithATokenForTheSelectedFlow() async throws {
        let voice = ConnectionVoice()
        let model = InspectionViewModel(video: QuietVideo(), analyzer: NoAnalyzer(), voice: voice, voiceTokens: FixedTokens())
        model.startVoice(agentID: AgentPreset.tutor.agentID, connection: .backend)
        for _ in 0..<100 where model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(voice.starts, ["token:token-for-tutor"])
        XCTAssertTrue(model.isVoiceRunning)
        await model.stopAll()
        model.startVoice(agentID: "custom", connection: .backend)
        for _ in 0..<100 where model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(voice.starts.last, "token:token-for-expert")
        await model.stopAll()
    }

    @MainActor func testBackendWithoutTokenSourceExplainsAndDoesNotStart() {
        let voice = ConnectionVoice()
        let model = InspectionViewModel(video: QuietVideo(), analyzer: NoAnalyzer(), voice: voice)
        XCTAssertFalse(model.canUseBackendVoice)
        model.startVoice(agentID: "agent-1", connection: .backend)
        XCTAssertFalse(model.isVoiceRunning)
        XCTAssertNotNil(model.error)
        XCTAssertTrue(voice.starts.isEmpty)
    }

    @MainActor func testRemoteDropIsReportedAndEndsTheCall() async throws {
        let voice = ConnectionVoice()
        let model = InspectionViewModel(video: QuietVideo(), analyzer: NoAnalyzer(), voice: voice)
        model.startVoice(agentID: "agent-1")
        for _ in 0..<100 where model.isVoiceBusy { try await Task.sleep(for: .milliseconds(10)) }
        voice.onStatus?("Error: ElevenLabs closed the call. Check that the account has credits and the agent is available.")
        XCTAssertFalse(model.isVoiceRunning)
        XCTAssertEqual(model.error?.contains("credits"), true)
        await model.stopAll()
    }
}

private struct FixedTokens: ConversationTokenSource {
    func token(flow: String) async throws -> String { "token-for-\(flow)" }
}

private struct NoAnalyzer: AnalysisService {
    func analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult {
        AnalysisResult(findings: [], model: "mock", milliseconds: 0, capturedAt: capturedAt)
    }
}

@MainActor private final class QuietVideo: VideoService {
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

@MainActor private final class ConnectionVoice: VoiceService {
    var onStatus: ((String) -> Void)?
    var onTranscript: (([TranscriptLine]) -> Void)?
    var onMuted: ((Bool) -> Void)?
    var starts: [String] = []
    func start(agentID: String) async throws { starts.append("agent:\(agentID)"); onStatus?("Connected") }
    func start(conversationToken: String) async throws { starts.append("token:\(conversationToken)"); onStatus?("Connected") }
    func stop() async {}
    func setMuted(_ muted: Bool) async throws {}
    func updateContext(_ text: String) async throws {}
}
