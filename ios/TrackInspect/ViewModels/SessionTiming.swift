import Foundation

/// Production sampling policy; tests can control elapsed time without waiting on hardware.
struct SessionTiming: Sendable {
    var analysisInterval: TimeInterval = 0.75
    var contextInterval: TimeInterval = 5
    /// Spacing between cloud descriptions while the finger keeps pointing.
    var describeInterval: TimeInterval = 10
    /// A new pointing gesture is described at once, but never closer together than this.
    var describeMinimum: TimeInterval = 3
    /// Consecutive analysed video frames a finger must hold still before it counts as pointing at something.
    var pointingDwellFrames = 2
    var frameTimeout: TimeInterval = 12
    var watchdogInterval: Duration = .seconds(2)
    /// Meta's audio guide: let the Bluetooth HFP route settle before starting the camera stream.
    var routeSettle: Duration = .seconds(2)
}
