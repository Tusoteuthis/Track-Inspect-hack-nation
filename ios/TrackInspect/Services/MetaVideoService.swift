import Foundation
import UIKit
@preconcurrency import MWDATCore
@preconcurrency import MWDATCamera

/// DAT owns video; voice uses the system audio route, not a DAT microphone stream.
@MainActor final class MetaVideoService: VideoService {
    var onFrame: ((UIImage) -> Void)?
    var onStatus: ((String) -> Void)?
    var onFailure: ((String) -> Void)?
    var beforeStream: (() async -> Void)?
    private var wearables: (any WearablesInterface)?
    private var selector: AutoDeviceSelector?
    private var session: DeviceSession?
    private var stream: MWDATCamera.Stream?
    private var tokens: [any AnyListenerToken] = []
    private var generation = UUID()
    private var linkTask: Task<Void, Never>?
    private var devicesTask: Task<Void, Never>?
    private var linkToken: (any AnyListenerToken)?

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
        let selector = AutoDeviceSelector(wearables: api)
        self.selector = selector
        observeLink(selector, api: api)
        return api
    }

    /// Keeps the selector's stream and the selected device's link listener alive for the
    /// app's lifetime; polling `linkState` alone never showed the glasses as connected.
    private func observeLink(_ selector: AutoDeviceSelector, api: any WearablesInterface) {
        Self.trace("configured registration=\(api.registrationState) devices=\(api.devices.count)")
        devicesTask = Task { @MainActor in
            for await ids in api.devicesStream() {
                for device in ids.compactMap({ api.deviceForIdentifier($0) }) {
                    Self.trace("device \(device.nameOrId()) type=\(device.deviceType()) link=\(device.linkState) compatibility=\(device.compatibility())")
                }
            }
        }
        linkTask = Task { @MainActor [weak self] in
            for await id in selector.activeDeviceStream() {
                guard let self else { return }
                if let stale = self.linkToken { await stale.cancel() }
                let device = id.flatMap { api.deviceForIdentifier($0) }
                self.linkToken = device?.addLinkStateListener { state in
                    Self.trace("link changed \(state)")
                }
                if let device {
                    Self.trace("active \(device.nameOrId()) type=\(device.deviceType()) link=\(device.linkState) compatibility=\(device.compatibility())")
                } else {
                    Self.trace("active none, devices=\(api.devices.count)")
                }
            }
        }
    }

    /// Link diagnostics readable from the app container: Library/Caches/TrackInspectLink.log
    nonisolated static func trace(_ message: String) {
        guard let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("TrackInspectLink.log") else { return }
        let line = Data("\(Date().formatted(.iso8601)) \(message)\n".utf8)
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: line)
        } else {
            try? line.write(to: url)
        }
    }

    func connectionStatus() -> GlassesConnectionStatus {
        #if targetEnvironment(simulator)
        return .unavailable
        #else
        do {
            let api = try prepare()
            // A running session is pinned: another connected pair must not mask its loss.
            let ids = session.map { [$0.deviceId] } ?? api.devices
            let links = ids.compactMap { api.deviceForIdentifier($0)?.linkState }
            return Self.connectionStatus(registration: api.registrationState, links: links)
        } catch {
            return .unavailable
        }
        #endif
    }

    static func connectionStatus(registration: RegistrationState, links: [LinkState]) -> GlassesConnectionStatus {
        switch registration {
        case .unavailable: return .unavailable
        case .available: return .notRegistered
        case .registering: return .awaitingApproval
        case .registered:
            if links.contains(.connected) { return .connected }
            if links.contains(.connecting) { return .connecting }
            return .disconnected
        }
    }

    func unregister() async throws -> Bool {
        let api = try prepare()
        return try await MetaRegistrationFlow.unregister(state: { api.registrationState }) {
            try await api.startUnregistration()
        }
    }

    func register() async throws -> GlassesRegistrationStatus {
        let api = try prepare()
        return try await MetaRegistrationFlow.begin(state: { api.registrationState }) {
            try await api.startRegistration()
        }
    }

    func handle(url: URL) async throws -> GlassesRegistrationStatus? {
        guard url.scheme == "trackinspect" else { return nil }
        let api = try prepare()
        return try await MetaRegistrationFlow.consumeCallback(state: { api.registrationState }) {
            try await api.handleUrl(url)
        }
    }

    func start() async throws {
        await stop()
        let run = generation
        do {
            let api = try prepare()
            onStatus?("Waiting for glasses…")
            // Permission calls fail with noDevice/noDeviceWithConnection until the SDK link is up.
            for _ in 0..<100 {
                if api.devices.contains(where: { api.deviceForIdentifier($0)?.linkState == .connected }) { break }
                try await Task.sleep(for: .milliseconds(100))
            }
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
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
                Self.trace("session error \(message)")
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run else { return }
                    self.onFailure?("Glasses: \(message). Stop other audio/camera apps and retry; Bluetooth voice can compete with video.")
                }
            })
            tokens.append(session.statePublisher.listen { [weak self] state in
                Self.trace("session state \(state)")
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run else { return }
                    if state == .stopped { self.onFailure?("Glasses session ended. Wear the glasses and restart video.") }
                }
            })
            Self.trace("session starting on \(api.deviceForIdentifier(device)?.nameOrId() ?? "?") dam=\((Bundle.main.object(forInfoDictionaryKey: "MWDAT") as? [String: Any])?["DAMEnabled"] as? Bool ?? false)")
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
                Self.trace("stream error \(message)")
                Task { @MainActor [weak self] in
                    guard let self, self.generation == run else { return }
                    self.onFailure?("Camera: \(message)")
                }
            })
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
            await beforeStream?()
            try Task.checkCancellation()
            guard generation == run else { throw CancellationError() }
            Self.trace("stream starting")
            await stream.start()
            onStatus?("Waiting for first video frame…")
        } catch let error as PermissionError {
            Self.trace("start failed permission \(error.rawValue)")
            await stop()
            throw AppFailure(message: Self.message(for: error))
        } catch {
            Self.trace("start failed \(error)")
            await stop()
            throw error
        }
    }

    static func message(for error: PermissionError) -> String {
        switch error {
        case .noDevice:
            return "Meta has not shared any glasses with TrackInspect. In Meta AI, open App connections, allow TrackInspect to use your glasses, then retry."
        case .noDeviceWithConnection:
            return "Your glasses are known but not connected. Unfold and wear them, keep Meta AI open in the background, wait a few seconds, then retry."
        case .connectionError:
            return "The connection to your glasses failed. Check Bluetooth, wear the glasses and retry."
        case .metaAINotInstalled:
            return "Install or update Meta AI on this iPhone, then retry."
        case .requestInProgress:
            return "A camera permission request is already open in Meta AI. Finish it there, then retry."
        case .requestTimeout:
            return "The camera permission request timed out. Approve camera access for TrackInspect in Meta AI, then retry."
        case .internalError:
            return "Meta could not check camera permission. Reopen Meta AI, confirm TrackInspect's access, then retry."
        @unknown default:
            return "Meta could not check camera permission (\(error.description)). Retry after reopening Meta AI."
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
