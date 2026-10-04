import XCTest
@testable import TrackInspect

final class AgentPresetTests: XCTestCase {
    func testEmbeddedPublicAgentIDs() {
        XCTAssertEqual(AgentPreset.expert.agentID, "agent_2201m43arfbffg5tz82bmy6730jx")
        XCTAssertEqual(AgentPreset.tutor.agentID, "agent_7601m43asar7ehn8a9z67x398qj2")
        XCTAssertEqual(Set(AgentPreset.allCases.map(\.agentID)).count, 2)
        XCTAssertTrue(AgentPreset.allCases.allSatisfy { $0.agentID.hasPrefix("agent_") })
    }

    func testSavedIDsOfTheRetiredAgentsMoveToTheirReplacements() {
        XCTAssertEqual(AgentPreset.current(for: "agent_3701m420qeqff2ysp5xh34vfkt5a"), AgentPreset.expert.agentID)
        XCTAssertEqual(AgentPreset.current(for: "agent_6401m424ywywecnrxne0rtp3frwx"), AgentPreset.tutor.agentID)
        XCTAssertEqual(AgentPreset.current(for: "agent_custom"), "agent_custom")
    }
}
