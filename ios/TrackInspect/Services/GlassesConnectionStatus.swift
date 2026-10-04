import Foundation

/// Transient link state; registration alone is not a connection.
enum GlassesConnectionStatus: Sendable, Equatable, CaseIterable {
    case checking, unavailable, notRegistered, awaitingApproval
    case disconnected, connecting, connected, streaming, paused

    var title: String {
        switch self {
        case .checking: "Checking connection…"
        case .unavailable: "Status unavailable"
        case .notRegistered: "Not registered"
        case .awaitingApproval: "Awaiting approval"
        case .disconnected: "Disconnected"
        case .connecting: "Connecting…"
        case .connected: "Connected"
        case .streaming: "Streaming"
        case .paused: "Status paused"
        }
    }

    var detail: String {
        switch self {
        case .checking: "Reading the glasses connection status."
        case .unavailable: "Check Meta app setup and Bluetooth on your iPhone."
        case .notRegistered: "Pair through Meta AI to authorize TrackInspect."
        case .awaitingApproval: "Complete approval in Meta AI, then return here."
        case .disconnected: "Registered with Meta, but no active glasses link. Wear your glasses and check Bluetooth."
        case .connecting: "Meta is establishing the glasses link."
        case .connected: "Glasses link active. Video is not currently confirmed streaming."
        case .streaming: "Receiving live video from your glasses."
        case .paused: "Connection checks resume when TrackInspect is active."
        }
    }

    var symbol: String {
        switch self {
        case .connected: "link"
        case .streaming: "video.fill"
        case .disconnected, .notRegistered: "link.badge.plus"
        case .unavailable: "exclamationmark.circle"
        case .paused: "pause.circle"
        default: "ellipsis.circle"
        }
    }
}
