import Foundation

/// Production sampling policy; tests can control elapsed time without waiting on hardware.
struct SessionTiming: Sendable {
    var analysisInterval: TimeInterval = 0.75
    var contextInterval: TimeInterval = 5
    var frameTimeout: TimeInterval = 12
    var watchdogInterval: Duration = .seconds(2)
}
