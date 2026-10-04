import XCTest
@preconcurrency import MWDATCore
@testable import TrackInspect

@MainActor final class MetaBuildModeTests: XCTestCase {
    func testSDKParsesBothExplicitModes() throws {
        for mode in [true, false] {
            var info = try XCTUnwrap(Bundle.main.infoDictionary)
            var config = try XCTUnwrap(info["MWDAT"] as? [String: Any])
            config["DAMEnabled"] = mode
            info["MWDAT"] = config
            XCTAssertEqual(try Configuration(infoDictionary: info).usesDam, mode)
        }
    }

    func testSettingsReportsInstalledMode() throws {
        let config = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "MWDAT") as? [String: Any])
        let mode = try XCTUnwrap(config["DAMEnabled"] as? Bool)
        XCTAssertEqual(InspectionSettingsView.installedMetaMode, mode ? "DAM" : "Legacy camera (without DAM)")
    }
}
