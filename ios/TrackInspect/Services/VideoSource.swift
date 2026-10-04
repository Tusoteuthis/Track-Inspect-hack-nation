import Foundation

/// User-selectable origin of live frames. Both stay on device.
enum VideoSource: String, CaseIterable, Identifiable, Sendable {
    case glasses
    case phone

    var id: String { rawValue }
    var title: String { self == .glasses ? "Glasses" : "iPhone" }
}
