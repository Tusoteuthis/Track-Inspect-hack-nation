import XCTest
@testable import TrackInspect

final class AgentPresetTests: XCTestCase {
    func testEmbeddedPublicAgentIDs() {
        XCTAssertEqual(AgentPreset.expert.agentID, "agent_3701m420qeqff2ysp5xh34vfkt5a")
        XCTAssertEqual(AgentPreset.tutor.agentID, "agent_6401m424ywywecnrxne0rtp3frwx")
        XCTAssertEqual(Set(AgentPreset.allCases.map(\.agentID)).count, 2)
        XCTAssertTrue(AgentPreset.allCases.allSatisfy { $0.agentID.hasPrefix("agent_") })
    }
}
