import Foundation

/// Public agent identifiers, not API credentials.
enum AgentPreset: String, CaseIterable, Identifiable {
    case expert
    case tutor

    var id: String { rawValue }
    var title: String { self == .expert ? "Expert" : "Tutor" }
    var agentID: String {
        switch self {
        case .expert: "agent_3701m420qeqff2ysp5xh34vfkt5a"
        case .tutor: "agent_6401m424ywywecnrxne0rtp3frwx"
        }
    }
}
