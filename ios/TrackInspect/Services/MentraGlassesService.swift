import Foundation
import MentraBluetoothSDK
import Observation

struct MentraDiscoveredDevice: Identifiable, Equatable {
    let id: String
    let name: String
    let model: String
    let signal: Int?
}

enum MentraGlassesModel: String, CaseIterable, Identifiable {
    case g1 = "Even Realities G1"
    case g2 = "Even Realities G2"
    case nimo = "NIMO"
    case mentraLive = "Mentra Live"

    var id: String { rawValue }
    var hasTextHUD: Bool { self != .mentraLive }

    fileprivate var sdkModel: DeviceModel {
        switch self {
        case .g1: .g1
        case .g2: .g2
        case .nimo: .nimo
        case .mentraLive: .mentraLive
        }
    }
}

/// Direct BLE lifecycle for Mentra-compatible glasses. This service provides
/// connection telemetry and supported text HUD output, not camera frames.
@MainActor @Observable
final class MentraGlassesService: NSObject {
    private(set) var isConnected = false
    private(set) var isReady = false
    private(set) var isScanning = false
    private(set) var batteryLevel: Int?
    private(set) var isCharging = false
    private(set) var connectedModel: MentraGlassesModel?
    private(set) var connectedName: String?
    private(set) var discovered: [MentraDiscoveredDevice] = []
    private(set) var lastError: String?

    private let sdk: MentraBluetoothSDK
    private var scanSession: ScanSession?
    private var devices: [String: Device] = [:]

    override init() {
        sdk = MentraBluetoothSDK(
            configuration: MentraBluetoothSDKConfiguration(analytics: .disabled)
        )
        super.init()
        sdk.delegate = self
        apply(sdk.glasses)
    }

    var canRenderHUD: Bool { isReady && connectedModel?.hasTextHUD == true }

    var statusText: String {
        if isScanning { return "Scanning for Mentra-compatible glasses…" }
        guard isConnected else { return "Not connected" }
        let name = connectedName ?? connectedModel?.rawValue ?? "Mentra glasses"
        guard isReady else { return "\(name) connecting…" }
        let battery = batteryLevel.map { " · \($0)%\(isCharging ? " charging" : "")" } ?? ""
        let hud = connectedModel?.hasTextHUD == false ? " · no text HUD" : ""
        return "\(name) connected\(battery)\(hud)"
    }

    func scan(model: MentraGlassesModel, timeout: TimeInterval = 15) {
        lastError = nil
        discovered = []
        devices = [:]
        do {
            isScanning = true
            scanSession = try sdk.scan(
                model: model.sdkModel,
                timeout: timeout,
                onResults: { [weak self] devices in
                    Task { @MainActor in self?.setDevices(devices) }
                },
                onComplete: { [weak self] devices in
                    Task { @MainActor in
                        self?.setDevices(devices)
                        self?.isScanning = false
                    }
                }
            )
        } catch {
            isScanning = false
            report(error)
        }
    }

    func stopScan() {
        scanSession = nil
        isScanning = false
    }

    func connect(id: String) {
        guard let device = devices[id] else { return }
        lastError = nil
        do { try sdk.connect(to: device) }
        catch { report(error) }
    }

    func connectDefault() {
        lastError = nil
        do { try sdk.connectDefault() }
        catch { lastError = "No saved Mentra glasses are available yet." }
    }

    func disconnect() { sdk.disconnect() }

    func forget() {
        sdk.forget()
        connectedModel = nil
        connectedName = nil
    }

    func sendHUDTest() async {
        guard canRenderHUD else {
            lastError = "This model does not provide a working text HUD."
            return
        }
        do { try await sdk.displayText("TrackInspect connected") }
        catch { report(error) }
    }

    private func setDevices(_ next: [Device]) {
        devices = Dictionary(uniqueKeysWithValues: next.map { ($0.id, $0) })
        discovered = next.map {
            MentraDiscoveredDevice(
                id: $0.id,
                name: $0.name,
                model: $0.model.rawValue,
                signal: $0.rssi
            )
        }
    }

    private func apply(_ glasses: GlassesRuntimeState) {
        isConnected = glasses.connected
        isReady = glasses.ready
        batteryLevel = glasses.battery?.level
        isCharging = glasses.battery?.charging ?? false
        connectedName = glasses.device?.bluetoothName
        connectedModel = Self.appModel(glasses.device?.deviceModel)
    }

    private static func appModel(_ model: DeviceModel?) -> MentraGlassesModel? {
        switch model {
        case .g1: .g1
        case .g2: .g2
        case .nimo: .nimo
        case .mentraLive: .mentraLive
        default: nil
        }
    }

    private func report(_ error: Error) {
        lastError = (error as? BluetoothSdkError)?.message ?? error.localizedDescription
    }
}

extension MentraGlassesService: MentraBluetoothSDKDelegate {
    func mentraBluetoothSDK(_ sdk: MentraBluetoothSDK, didUpdateGlasses glasses: GlassesRuntimeState) {
        apply(glasses)
    }

    func mentraBluetoothSDK(_ sdk: MentraBluetoothSDK, didDiscover device: Device) {
        devices[device.id] = device
        setDevices(Array(devices.values))
    }

    func mentraBluetoothSDK(_ sdk: MentraBluetoothSDK, didStopScan reason: ScanStopReason) {
        isScanning = false
    }

    func mentraBluetoothSDK(_ sdk: MentraBluetoothSDK, didFail error: BluetoothSdkError) {
        report(error)
    }
}
