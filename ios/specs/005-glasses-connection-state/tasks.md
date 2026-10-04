# Tasks and consistency analysis

- [x] T001 Add status model and SDK snapshot mapping, update protocol and mocks. FR-002/004.
- [x] T002 Add ViewModel frame-evidence derivation and foreground refresh; scene-scoped Settings status/task. FR-001–004.
- [x] T003 Add mapping, startup/frame/stop and no-capture regression tests; assert Settings status in UI suite. FR-001–004.
- [x] T004 Run full tests, sign/install build 5, record evidence and remaining hardware validation.

Validation (2026-10-04): 51 unit + 7 UI tests passed (58 total), including Settings accessibility audit and five connection regressions. After removing a test-only captured-clock warning, all 51 unit tests passed again. Device build and strict/deep signature verification passed. Build 0.1.0 (5) installed/launched on the original iPhone 16 Pro Max. Logs: `/tmp/trackinspect-connection-tests.log`, `/tmp/trackinspect-connection-unit-tests.log`, `/tmp/trackinspect-connection-device.log`. App: `/tmp/TrackInspect-connection-build/Build/Products/Debug-iphoneos/TrackInspect.app`.

Remaining hardware gate: observe actual glasses connection/disconnection and streaming transitions while Settings stays open; simulator mapping and installation do not establish link accuracy on hardware.

Analysis: all requirements have implementation and test coverage planned. No conflicting registration/connection meanings; no capture changes. Task order T001 → T002 → T003 → T004. Scope and clarification assumptions are explicit; no blocking questions.
