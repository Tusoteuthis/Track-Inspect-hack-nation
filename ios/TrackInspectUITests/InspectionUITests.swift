import XCTest

@MainActor final class InspectionUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testDashboardAndSetup() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["videoControl"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["videoControl"].label, "Start glasses video")
        XCTAssertEqual(app.staticTexts["workspaceHeading"].label, "Inspection")
        XCTAssertTrue(app.buttons["photoPicker"].exists)
        app.buttons["settingsButton"].tap()
        XCTAssertTrue(app.navigationBars["Setup"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["setupIntroduction"].exists)
        let connection = app.staticTexts["glassesConnectionStatus"]
        XCTAssertTrue(connection.waitForExistence(timeout: 3))
        XCTAssertEqual(connection.label, "Status unavailable") // Simulator never claims a physical link.
        screenshot("Workspace settings", app: app)
        let agent = app.textFields["agentID"]
        scrollTo(agent, in: app)
        XCTAssertTrue(agent.isHittable)
        XCTAssertEqual(agent.label, "Public ElevenLabs agent ID")
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["videoControl"].exists)
        screenshot("Dashboard", app: app)
    }

    func testUnpairRequiresConfirmationAndCanBeCancelled() throws {
        let app = launch()
        app.buttons["settingsButton"].tap()
        let unpair = app.buttons["unpairGlasses"]
        XCTAssertTrue(unpair.waitForExistence(timeout: 3))
        scrollTo(unpair, in: app)
        unpair.tap()
        let confirmation = app.alerts["Unpair TrackInspect?"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 3))
        XCTAssertTrue(confirmation.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Your glasses stay paired")).firstMatch.exists)
        confirmation.buttons["Cancel"].tap()
        XCTAssertFalse(app.staticTexts["unpairStatus"].exists)
        XCTAssertTrue(unpair.isEnabled)
    }

    func testSetupIdentityAndLargeTextRemainReachable() throws {
        let app = launch(largeText: true)
        app.buttons["settingsButton"].tap()
        XCTAssertTrue(app.navigationBars["Setup"].waitForExistence(timeout: 3))
        let field = app.textFields["agentID"]
        scrollTo(field, in: app)
        XCTAssertTrue(field.isHittable)
        let identity = app.staticTexts["applicationIdentity"]
        scrollTo(identity, in: app)
        XCTAssertEqual(identity.label, "Application identifier")
        XCTAssertEqual(identity.value as? String, "ai.track-inspect.app")
        screenshot("Settings accessibility text", app: app)
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["settingsButton"].exists)
    }

    func testCloudVoiceRequiresConsentAndCanBeCancelled() throws {
        let app = launch()
        let voice = app.buttons["voiceControl"]
        scrollTo(voice, in: app)
        voice.tap()
        let consent = app.alerts["Start cloud voice?"]
        XCTAssertTrue(consent.waitForExistence(timeout: 3))
        XCTAssertTrue(consent.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Microphone audio will be streamed")).firstMatch.exists)
        consent.buttons["Cancel"].tap()
        XCTAssertEqual(voice.label, "Talk to agent")
        XCTAssertEqual(app.staticTexts["voiceStatus"].label, "Idle")
        let sharing = app.switches["shareFindings"]
        scrollTo(sharing, in: app)
        XCTAssertEqual(sharing.value as? String, "0")
    }

    func testEmptyAgentShowsActionableErrorWithoutMicrophonePrompt() throws {
        let app = launch()
        let voice = app.buttons["voiceControl"]
        scrollTo(voice, in: app)
        voice.tap()
        app.alerts["Start cloud voice?"].buttons["Start voice"].tap()
        let error = app.alerts["Attention"]
        XCTAssertTrue(error.waitForExistence(timeout: 5))
        XCTAssertTrue(error.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Enter a public ElevenLabs agent ID")).firstMatch.exists)
        error.buttons["OK"].tap()
        XCTAssertEqual(voice.label, "Talk to agent")
    }

    func testLargestTextKeepsControlsReachable() throws {
        let app = launch(largeText: true)
        let video = app.buttons["videoControl"]
        scrollTo(video, in: app)
        XCTAssertTrue(video.isHittable)
        XCTAssertGreaterThanOrEqual(video.frame.height, 44)
        XCTAssertLessThanOrEqual(video.frame.maxX, app.frame.maxX)
        screenshot("Accessibility text video", app: app)
        let voice = app.buttons["voiceControl"]
        scrollTo(voice, in: app)
        XCTAssertTrue(voice.isHittable)
        XCTAssertLessThanOrEqual(voice.frame.maxX, app.frame.maxX)
        screenshot("Accessibility text voice", app: app)
        voice.tap()
        XCTAssertTrue(app.alerts["Start cloud voice?"].waitForExistence(timeout: 3))
        app.alerts["Start cloud voice?"].buttons["Cancel"].tap()
    }

    func testDashboardAccessibilityAudit() throws {
        let app = launch()
        XCTAssertTrue(app.buttons["videoControl"].waitForExistence(timeout: 5))
        try app.performAccessibilityAudit(for: [.contrast, .sufficientElementDescription, .hitRegion]) { issue in
            print("Accessibility audit: \(issue.detailedDescription); element: \(String(describing: issue.element))")
            return false // Report every issue; never suppress audit failures.
        }
    }

    func testSetupAccessibilityAudit() throws {
        let app = launch()
        app.buttons["settingsButton"].tap()
        XCTAssertTrue(app.staticTexts["setupIntroduction"].waitForExistence(timeout: 3))
        // Audit the initial Settings viewport, including connection mode and pairing.
        // An arbitrary full swipe can leave labels obscured under the navigation bar.
        try app.performAccessibilityAudit(for: [.contrast, .sufficientElementDescription, .hitRegion]) { issue in
            print("Setup accessibility audit: \(issue.detailedDescription); element: \(String(describing: issue.element))")
            return false
        }
    }

    private func launch(largeText: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-elevenLabsAgentID", "", "-AppleLanguages", "(en)"]
        if largeText {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
        app.launch()
        return app
    }

    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<14 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable, "Expected control must be reachable by scrolling")
    }

    private func screenshot(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
