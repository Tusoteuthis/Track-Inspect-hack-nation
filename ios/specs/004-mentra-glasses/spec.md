# Feature: Mentra-compatible glasses

**Created**: 2026-10-03 | **Feature**: 004-mentra-glasses | **Branch**: `ios-app`

## User story
As an inspector blocked on Meta provisioning, I can directly discover and connect supported Mentra-compatible glasses over Bluetooth while retaining the existing Meta and photo-analysis paths.

## Requirements
- **FR-001**: Add the official native `MentraBluetoothSDK` Swift package, with SDK analytics disabled.
- **FR-002**: Support scanning by model, selecting a discovered device, reconnecting to a saved default, disconnecting, and forgetting it.
- **FR-003**: Show connection readiness, model, and battery state in Settings with accessible controls and recoverable errors.
- **FR-004**: Support text HUD tests only on Even Realities G1/G2 and NIMO. Clearly state that Mentra Live has no working text HUD in this SDK.
- **FR-005**: Do not represent Mentra as a local vision source. Its Bluetooth SDK provides no in-process camera-frame callback; TrackInspect live local analysis remains Meta DAT or selected photos.
- **FR-006**: Preserve existing Meta video, ElevenLabs consent/routing, local-image privacy, app identity, and foreground-only capture behavior.

## Acceptance
- Simulator build and relevant tests pass with the package linked.
- Settings exposes model-specific scan, connect, reconnect, disconnect, forget, and supported-HUD test actions.
- Real BLE discovery, connection, HUD rendering, and hardware audio/camera behavior remain physical-device acceptance gates.
