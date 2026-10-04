import Foundation

/// How a voice call reaches ElevenLabs.
enum VoiceConnection: String, CaseIterable, Identifiable, Sendable {
    /// The app connects to a public agent by its ID.
    case direct
    /// The TrackInspect backend issues a short-lived conversation token for its own Expert or Tutor agent.
    case backend

    var id: String { rawValue }
    var title: String { self == .direct ? "Direct" : "Backend" }
}

protocol ConversationTokenSource: Sendable {
    /// `flow` is "expert" or "tutor".
    func token(flow: String) async throws -> String
}

/// `GET /api/conversation-token` on the TrackInspect backend.
struct BackendConversationTokens: ConversationTokenSource {
    let base: URL
    let accessToken: String?

    /// Nil when this build carries no backend host or access token (`Secrets.xcconfig`).
    init?(bundle: Bundle = .main) {
        let config = bundle.object(forInfoDictionaryKey: "Backend") as? [String: String] ?? [:]
        let host = (config["Host"] ?? "").trimmingCharacters(in: .whitespaces)
        let token = (config["AccessToken"] ?? "").trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty, !token.isEmpty, let base = URL(string: "https://\(host)") else { return nil }
        self.init(base: base, accessToken: token)
    }

    init(base: URL, accessToken: String?) {
        self.base = base
        self.accessToken = accessToken
    }

    func request(flow: String) -> URLRequest {
        var request = URLRequest(url: base.appending(path: "api/conversation-token")
            .appending(queryItems: [URLQueryItem(name: "flow", value: flow)]), timeoutInterval: 20)
        if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
        return request
    }

    func token(flow: String) async throws -> String {
        let (data, response) = try await URLSession.shared.data(for: request(flow: flow))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        struct Issued: Decodable { let token: String }
        guard (200..<300).contains(status), let issued = try? JSONDecoder().decode(Issued.self, from: data),
              !issued.token.isEmpty else {
            throw AppFailure(message: status == 401
                ? "The inspection backend rejected this build's access token."
                : "The inspection backend did not issue a voice token (status \(status)).")
        }
        return issued.token
    }
}
