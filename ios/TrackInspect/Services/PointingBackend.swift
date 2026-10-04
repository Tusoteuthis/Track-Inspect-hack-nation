import Foundation
import ImageIO

/// One described pointing gesture, as stored by the TrackInspect backend (WS6 pointing-event ingest).
struct PointingRecord: Sendable {
    /// Lowercase UUID; the same id the voice agent is given.
    let eventID: String
    let capturedAt: Date
    /// The analysed frame and the same frame with finger and target box painted on, both JPEG.
    let frame: Data
    let annotated: Data
    /// Target box in unit image coordinates, origin top-left.
    let region: CGRect
    let description: String
}

protocol PointingRecorder: Sendable {
    func record(_ record: PointingRecord) async throws
    func endSession() async
}

/// The line the Expert agent's prompt expects for a pointing gesture, mirroring the web client's
/// `formatPointingEventUpdate`. The description travels as a labelled machine guess.
enum PointingEventLine {
    static func text(eventID: String, description: String) -> String {
        var cleaned = description.filter { !"[]\"".contains($0) }
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
        if cleaned.count > 300 { cleaned = cleaned.prefix(300).trimmingCharacters(in: .whitespaces) + "…" }
        return "[POINTING_EVENT] event_id=\(eventID) mapping_status=resolved channel=unknown trace=unknown "
            + "record_state=on_record source=live. The expert is pointing at this region. Do not interpret it. "
            + "When there is a natural pause, ask about it. "
            + "[VISUAL_CONTEXT] A vision model describes what the expert points at as: \"\(cleaned)\" "
            + "This is a machine guess and may be wrong. It is not the expert's words. "
            + "Use it only to say which thing you mean when you ask; never state it as fact."
    }
}

/// Stores pointing events and their frames in the project backend. One expert session per run,
/// created on the first event. Uploads leave the device; the ViewModel calls this only under the cloud switch.
actor BackendPointingRecorder: PointingRecorder {
    private let base: URL
    private let token: String?
    private var session: (id: String, started: Date)?

    /// Nil when this build carries no backend host or access token (`Secrets.xcconfig`).
    init?(bundle: Bundle = .main) {
        let config = bundle.object(forInfoDictionaryKey: "Backend") as? [String: String] ?? [:]
        let host = (config["Host"] ?? "").trimmingCharacters(in: .whitespaces)
        let token = (config["AccessToken"] ?? "").trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty, !token.isEmpty, let base = URL(string: "https://\(host)") else { return nil }
        self.init(base: base, token: token)
    }

    init(base: URL, token: String?) {
        self.base = base
        self.token = token
    }

    func record(_ record: PointingRecord) async throws {
        let session = try await currentSession()
        let assetID = UUID().uuidString.lowercased()
        guard let frame = Self.pixelSize(of: record.frame), let annotated = Self.pixelSize(of: record.annotated) else {
            throw AppFailure(message: "The pointing frame could not be read for upload.")
        }
        _ = try await send(Self.assetRequest(base: base, session: session.id, asset: assetID, record: record,
                                             frame: frame, annotated: annotated))
        let elapsed = max(0, Int(record.capturedAt.timeIntervalSince(session.started) * 1000))
        _ = try await send(Self.eventRequest(base: base, session: session.id, asset: assetID, record: record,
                                             frame: frame, sessionTimeMs: elapsed))
    }

    func endSession() async {
        guard let session else { return }
        self.session = nil
        struct Revision: Decodable { let rev: Int }
        guard let data = try? await send(URLRequest(url: base.appending(path: "api/sessions/\(session.id)"))),
              let rev = try? JSONDecoder().decode(Revision.self, from: data).rev else { return }
        _ = try? await send(Self.json("POST", base.appending(path: "api/sessions/\(session.id)/lifecycle"),
                                      ["action": "end", "rev": rev]))
    }

    private func currentSession() async throws -> (id: String, started: Date) {
        if let session { return session }
        struct Created: Decodable {
            let session_id: String
            let rev: Int
        }
        let created = try JSONDecoder().decode(Created.self, from: try await send(
            Self.json("POST", base.appending(path: "api/sessions"), ["role": "expert", "source": "live"])))
        _ = try await send(Self.json("POST", base.appending(path: "api/sessions/\(created.session_id)/lifecycle"),
                                     ["action": "start", "rev": created.rev]))
        let session = (created.session_id, Date.now)
        self.session = session
        return session
    }

    private func send(_ request: URLRequest) async throws -> Data {
        var request = request
        request.timeoutInterval = 30
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            struct Failure: Decodable {
                struct Body: Decodable { let code: String }
                let error: Body
            }
            let code = (try? JSONDecoder().decode(Failure.self, from: data))?.error.code ?? "no detail"
            throw AppFailure(message: "The inspection backend answered \(status) (\(code)).")
        }
        return data
    }

    // MARK: - Request shapes (ws6-api-v0: asset first, then the event that references it)

    static func json(_ method: String, _ url: URL, _ body: [String: Any]) throws -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    static func assetRequest(base: URL, session: String, asset: String, record: PointingRecord,
                             frame: CGSize, annotated: CGSize) throws -> URLRequest {
        let meta: [String: Any] = [
            "kind": "frame", "captured_at_utc": record.capturedAt.ISO8601Format(), "source": "live",
            "event_id": record.eventID,
            "original": ["width_px": Int(frame.width), "height_px": Int(frame.height)],
            "highlighted": ["width_px": Int(annotated.width), "height_px": Int(annotated.height)]
        ]
        let boundary = "trackinspect-\(asset)"
        var body = Data()
        func part(_ header: String, _ content: Data) {
            body.append(Data("--\(boundary)\r\n\(header)\r\n\r\n".utf8))
            body.append(content)
            body.append(Data("\r\n".utf8))
        }
        part("Content-Disposition: form-data; name=\"meta\"", try JSONSerialization.data(withJSONObject: meta))
        part("Content-Disposition: form-data; name=\"original\"; filename=\"original.jpg\"\r\nContent-Type: image/jpeg", record.frame)
        part("Content-Disposition: form-data; name=\"highlighted\"; filename=\"highlighted.jpg\"\r\nContent-Type: image/jpeg", record.annotated)
        body.append(Data("--\(boundary)--\r\n".utf8))
        var request = URLRequest(url: base.appending(path: "api/sessions/\(session)/assets/\(asset)"))
        request.httpMethod = "PUT"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return request
    }

    static func eventRequest(base: URL, session: String, asset: String, record: PointingRecord,
                             frame: CGSize, sessionTimeMs: Int) throws -> URLRequest {
        // The contract wants a box strictly inside the unit square.
        let box = record.region.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        let x = min(max(box.minX, 0), 0.99), y = min(max(box.minY, 0), 0.99)
        let body: [String: Any] = [
            "schema_version": "ws3.v0", "session_id": session, "event_id": record.eventID, "source": "live",
            "captured_at_utc": record.capturedAt.ISO8601Format(), "session_time_ms": sessionTimeMs,
            "frame_id": asset, "asset_id": asset, "image_ref": "pending", "highlighted_image_ref": "pending",
            "region": [
                "x": x, "y": y, "width": min(max(box.width, 0.01), 1 - x), "height": min(max(box.height, 0.01), 1 - y),
                "coordinate_space": "original_frame_normalized",
                "frame_width_px": Int(frame.width), "frame_height_px": Int(frame.height)
            ] as [String: Any],
            // The box is known in the frame; which trace or channel it lies on is not.
            "mapping_status": "resolved", "trace_id": NSNull(), "channel_id": NSNull(), "signal_interval": NSNull(),
            "record_state": "on_record", "target_description": String(record.description.prefix(600))
        ]
        return try json("PUT", base.appending(path: "api/sessions/\(session)/events/\(record.eventID)"), body)
    }

    /// Encoded pixel size, which is what the backend checks the declared dimensions against.
    static func pixelSize(of image: Data) -> CGSize? {
        guard let source = CGImageSourceCreateWithData(image as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int, width > 0, height > 0 else { return nil }
        return CGSize(width: width, height: height)
    }
}
