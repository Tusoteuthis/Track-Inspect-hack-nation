import Foundation
import UIKit
@preconcurrency import MWDATCore
@preconcurrency import MWDATCamera

/// DAT owns video; voice uses the system audio route, not a DAT microphone stream.
@MainActor final class MetaVideoService: VideoService {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    private var wearables: (any WearablesInterface)?
    private var selector: AutoDeviceSelector?
    private var session: DeviceSession?
    private var stream: MWDATCamera.Stream?
    private var tokens: [any AnyListenerToken] = []
    private var generation = UUID()

    private func prepare() throws -> any WearablesInterface {
        if let wearables { return wearables }
        let config = Bundle.main.object(forInfoDictionaryKey: "MWDAT") as? [String: Any]
        guard let appID = config?["MetaAppID"] as? String, !appID.isEmpty,
              !appID.contains("$("),
              let token = config?["ClientToken"] as? String, !token.isEmpty else {
            throw AppFailure(message: "Add your Meta app credentials in Config/Secrets.xcconfig and rebuild. Photo analysis works without glasses setup.")
        }
        try Wearables.configure()
        let api = Wearables.shared
        wearables = api
        selector = AutoDeviceSelector(wearables: api)
        return api
    }

    func register() async throws {
        try await prepare().startRegistration()
        onStatus?("Complete pairing in the Meta app, then start video.")
    }

    func handle(url: URL) async throws {
        guard url.scheme == "trackinspect" else { return }
        _ = try await prepare().handleUrl(url)
    }

    func start() async throws {
        await stop()
        let run = generation
        do {
            let api = try prepare()
            onStatus?("Waiting for glasses…")
            if try await api.checkPermissionStatus(.camera) != .granted {
                guard try await api.requestPermission(.camera) == .granted else {
                    throw AppFailure(message: "Camera access was denied in the Meta app.")
                }
            }
            guard let selector else { throw AppFailure(message: "Device selector unavailable.") }
            for _ in 0..<50 {
                if selector.activeDevice != nil { break }
                try await Task.sleep(for: .milliseconds(100))
            }
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
            guard let device = selector.activeDevice else {
                throw AppFailure(message: "No glasses available. Pair in Meta AI, wear the glasses, and close other camera or audio sessions.")
            }
            let session = try api.createSession(deviceSelector: SpecificDeviceSelector(device: device))
            self.session = session
            tokens.append(session.errorPublisher.listen { [weak self] error in
                let message = String(describing: error)
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run else { return }
                    self.onFailure?("Glasses: \(message). Stop other audio/camera apps and retry; Bluetooth voice can compete with video.")
                }
            })
            tokens.append(session.statePublisher.listen { [weak self] state in
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run else { return }
                    if state == .stopped { self.onFailure?("Glasses session ended. Wear the glasses and restart video.") }
                }
            })
            try session.start()
            for _ in 0..<80 {
                if session.state == .started { break }
                if session.state == .stopped { throw AppFailure(message: "Glasses ended the session.") }
                try await Task.sleep(for: .milliseconds(100))
            }
            guard session.state == .started else { throw AppFailure(message: "Glasses session timed out.") }
            let config = StreamConfiguration(videoCodec: .raw, resolution: .low, frameRate: 24)
            for _ in 0..<6 {
                try Task.checkCancellation()
                if let stream = try session.addStream(config: config) {
                    self.stream = stream
                    break
                }
                try await Task.sleep(for: .milliseconds(250))
            }
            guard let stream else { throw AppFailure(message: "Camera capability unavailable. Check glasses firmware and Meta permissions.") }
            tokens.append(stream.videoFramePublisher.listen { [weak self] frame in
                // The SDK's frame is immutable. Convert before crossing to UI isolation.
                let image = frame.makeUIImage()
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run, let image else { return }
                    self.onFrame?(image)
                }
            })
            tokens.append(stream.errorPublisher.listen { [weak self] error in
                let message = String(describing: error)
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run else { return }
                    self.onFailure?("Camera: \(message)")
                }
            })
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
            await stream.start()
            onStatus?("Waiting for first video frame…")
        } catch {
            await stop()
            throw error
        }
    }

    func stop() async {
        generation = UUID()
        let oldTokens = tokens
        tokens.removeAll()
        let oldStream = stream
        let oldSession = session
        stream = nil
        session = nil
        for token in oldTokens { await token.cancel() }
        await oldStream?.stop()
        oldSession?.stop()
    }
}
