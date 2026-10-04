import Foundation

/// Public agent identifiers, not API credentials.
enum AgentPreset: String, CaseIterable, Identifiable {
    case expert
    case tutor

    var id: String { rawValue }
    var title: String { self == .expert ? "Expert" : "Tutor" }
    var agentID: String {
        switch self {
        case .expert: "agent_2201m43arfbffg5tz82bmy6730jx"
        case .tutor: "agent_7601m43asar7ehn8a9z67x398qj2"
        }
    }

    /// Saved IDs of the first agents, whose account ran out of credits, move to their replacements.
    static func current(for saved: String) -> String {
        switch saved {
        case "agent_3701m420qeqff2ysp5xh34vfkt5a": expert.agentID
        case "agent_6401m424ywywecnrxne0rtp3frwx": tutor.agentID
        default: saved
        }
    }
}
