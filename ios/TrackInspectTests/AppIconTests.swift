import XCTest
import UIKit

final class AppIconTests: XCTestCase {
    func testCompiledPrimaryIconsForPhoneAndPad() throws {
        // Bundle's convenience lookup resolves device-qualified keys for the running
        // idiom. Read the compiled plist directly to validate both platform entries.
        let data = try Data(contentsOf: Bundle.main.bundleURL.appendingPathComponent("Info.plist"))
        let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        for key in ["CFBundleIcons", "CFBundleIcons~ipad"] {
            let icons = try XCTUnwrap(plist[key] as? [String: Any], "Missing \(key)")
            let primary = try XCTUnwrap(icons["CFBundlePrimaryIcon"] as? [String: Any])
            XCTAssertEqual(primary["CFBundleIconName"] as? String, "AppIcon")
            let files = try XCTUnwrap(primary["CFBundleIconFiles"] as? [String])
            XCTAssertFalse(files.isEmpty)
        }
    }

    @MainActor func testCompiledIconPNGIsRenderable() throws {
        let files = try FileManager.default.contentsOfDirectory(at: Bundle.main.bundleURL, includingPropertiesForKeys: nil)
        let icon = try XCTUnwrap(files.first { $0.lastPathComponent.hasPrefix("AppIcon") && $0.pathExtension == "png" })
        let image = try XCTUnwrap(UIImage(contentsOfFile: icon.path))
        XCTAssertGreaterThan(image.size.width, 0)
        XCTAssertEqual(image.size.width, image.size.height)
    }
}
