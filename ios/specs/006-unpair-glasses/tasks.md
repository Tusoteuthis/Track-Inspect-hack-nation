# Tasks

- [x] T001 Add unregistration protocol/helper/adapter and update mocks.
- [x] T002 Add confirmed Settings action and lifecycle-safe ViewModel orchestration.
- [x] T003 Test SDK outcomes, shutdown/retry/re-pair, confirmation cancellation; run regression suites.
- [x] T004 Sign/install build 6 and record evidence without performing user unregistration.

2026-10-04: 57 unit + 8 UI tests passed (65 total). Signed device build and deep/strict signature verification passed. Build 0.1.0 (6) installed/launched on the original iPhone 16 Pro Max. Logs: `/tmp/trackinspect-unpair-tests.log`, `/tmp/trackinspect-unpair-device.log`; artifact `/tmp/TrackInspect-unpair-build/Build/Products/Debug-iphoneos/TrackInspect.app`.

No unregistration was invoked on the user's phone. Actual Meta removal/re-registration and subsequent connection recovery remain user-triggered hardware checks; installation/tests do not prove the missing-key problem resolved.
