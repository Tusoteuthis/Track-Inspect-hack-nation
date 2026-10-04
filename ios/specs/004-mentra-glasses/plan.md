# Plan: Mentra-compatible glasses

Use the same native integration boundary established by SaveVision and Stozn: the official Mentra Bluetooth SDK owns direct BLE lifecycle and optional text HUD output, while Meta DAT remains the only live in-process glasses-frame source. Add an observable main-actor adapter so SDK types do not escape into views. Inject it at app composition and render controls in Settings.

## Decisions
- Pin `MentraBluetoothSDK` exactly at `0.1.20`, matching the validated sibling integrations rather than adopting prerelease tags.
- Disable SDK analytics at initialization.
- Offer G1, G2, NIMO, and Mentra Live; gate HUD output to G1/G2/NIMO.
- Do not add background BLE modes: TrackInspect remains foreground-only.
- Do not add webhook/RTMP/WHIP infrastructure or claim Mentra camera frames are locally available.

## Validation
Regenerate with XcodeGen, resolve SwiftPM, build/test the TrackInspect scheme in the simulator, then produce a signed device build when available. Hardware behavior remains unverified until exercised with supported glasses.
