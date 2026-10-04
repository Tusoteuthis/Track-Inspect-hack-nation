# Meta registration fix — 0.1.0 (4)

## Report and cause

The device screenshot displayed `MWDATCore.RegistrationError error 0` during pairing. In the pinned Meta DAT 0.7.0 SDK, raw value **0 is `alreadyRegistered`**, confirmed by a runtime regression test. This is existing Meta app authorization, not a camera connection failure.

The adapter always called `startRegistration()`, and the ViewModel displayed the enum's generic `localizedDescription`. Repeating a successful registration therefore produced a false failure.

## Fix

- Registered state and an `.alreadyRegistered` race return an idempotent successful result.
- Registering state does not start another Meta handoff; the ViewModel also coalesces concurrent Pair requests.
- A typed, SDK-free registration result distinguishes registered from awaiting approval.
- Registration feedback is separate from video status, so background camera teardown cannot erase it.
- Dashboard and setup display “Registered with Meta. Wear your glasses, then tap Start video.”
- Actual configuration, missing Meta AI, network and unknown errors have actionable messages. SDK-consumed return links only report registration when state confirms it; genuine callback failures are not swallowed.
- No credentials, pairing grants or SDK persisted state were cleared. No automatic camera/microphone capture was added.

## Validation and deployment

- **46 XCTest + 7 XCUITest passed** (53 total), including 14 registration regressions.
- Signed iOS build and deep/strict signature verification passed.
- **0.1.0 (4), `ai.track-inspect.app`, installed and launched successfully on the original iPhone 16 Pro Max on 2026-10-03.**
- App was built in isolated `/tmp/TrackInspect-registration-build` to avoid stale signed resources from earlier build directories.
- Logs: `/tmp/trackinspect-registration-tests.log`, `/tmp/trackinspect-registration-device.log`.

Next user check: repeat Pair if desired, then wear the glasses and tap **Start video**. Registered app access does not prove the glasses are currently connected, camera permission is granted or simultaneous Bluetooth voice/video is supported. Those hardware checks remain separate.
