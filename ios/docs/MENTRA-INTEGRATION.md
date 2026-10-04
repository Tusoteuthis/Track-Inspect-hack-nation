# Mentra-compatible glasses integration

TrackInspect supports the same bounded Mentra role used by SaveVision and Stozn.

- Official native package: `MentraBluetoothSDK` `0.1.20`
- Transport: direct BLE; no Mentra account, API key, or companion app
- Analytics: disabled in SDK configuration
- Models offered: Even Realities G1/G2, NIMO, Mentra Live
- Lifecycle: scan, select/connect, reconnect saved default, disconnect, forget
- Telemetry: readiness, connected name/model, battery and charging state
- HUD: short text test on G1/G2/NIMO only

## Camera boundary

Mentra is not registered as TrackInspect's `VideoService`. The native Bluetooth SDK has no in-process camera-frame callback: photos are delivered to a webhook and streams publish to RTMP/SRT/WHIP infrastructure. No such relay is part of this prototype, and routing cloud media back into local analysis would violate its current on-device-video architecture. Meta DAT remains the live glasses-frame source; selected photos remain the credential-free fallback.

Mentra Live's text method is a silent no-op in this pinned SDK, so the UI disables HUD testing and labels that limitation rather than claiming output.

## Local validation

- XcodeGen generation: passed.
- Simulator compile with Mentra package linked: passed as part of the test build.
- XCTest: 30/30 passed.
- XCUITest: 6/7 passed on the full run. Focused setup audits then identified low contrast on the pre-existing privacy copy and new Mentra capability copy; both were promoted from secondary to primary text. A final full accessibility rerun remains pending.

Simulator CoreBluetooth reported its expected unavailable/XPC state. BLE discovery, pairing, reconnect, battery, HUD output, and firmware compatibility have not been validated on physical Mentra-compatible glasses.
