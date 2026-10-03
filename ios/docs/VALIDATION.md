# Validation results

## Full Spec Kit run — 2026-10-03

**Toolchain**: Xcode 27.0 (27A266a), Swift 6 strict concurrency  
**App identity**: `ai.track-inspect.app` (verified from built device Info.plist and XCTest)  
**Feature**: `specs/001-glasses-inspection/`

| Check | Result |
|-------|--------|
| XcodeGen regeneration | Passed |
| Spec Kit prerequisites and Bash script syntax | Passed |
| Source Info.plist lint | Passed |
| Simulator compile/link and combined test run, iPhone 16 / iOS 18.5 | **35 tests passed: 30 XCTest + 5 XCUITest; zero failures** |
| Narrow layout, iPhone SE (3rd generation) / iOS 18.5 | **5 XCUITest tests passed again; zero failures** |
| Generic iOS device compile/link (`CODE_SIGNING_ALLOWED=NO`) | **Passed**; not a signed install/hardware test |
| Built device `CFBundleIdentifier` | **`ai.track-inspect.app`** |
| UI screenshots at default and largest accessibility text size | Reviewed; controls wrap/stack and remain scroll-reachable |
| Contrast, sufficient descriptions, hit-region audit | Passed on both tested simulator form factors |
| Spec/plan/task consistency | 14 requirements mapped to 21 tasks; no blocking design conflicts; hardware acceptance explicitly open |

### Automated coverage

- Actual built-in Vision inference on a generated image; malformed image rejection.
- Optional custom-model load failure, classifier signature/output contract rejection, sorted/finite/unique/bounded findings. No trained inspection-model accuracy is claimed.
- Concurrent stop callers join teardown; restart is blocked during teardown and works afterward.
- Cancellation/failure of video/voice startup; active voice failure and explicit retry.
- Old frame/status/error/transcript/analysis callbacks cannot publish into newer runs.
- Slow/cancelled inference keeps its slot; repeated photo requests coalesce to one replacement; live frames drop while busy.
- Monotonic context-rate boundaries, default privacy, opt-out cancellation and no queued slow sends.
- Background starts independent video/voice shutdown, disables summary sharing and prevents automatic resume.
- No-frame watchdog and reset by incoming frames.
- Correct application identity and Meta return scheme, with no background capture modes declared.
- Dashboard/setup navigation, cloud voice consent/cancel, empty-agent actionable error before microphone permission, largest-text control reachability and automated accessibility audit.

### Issues found and fixed during the run

Regression tests initially reproduced early-returning stop calls, stale callbacks, sequential background teardown and inference-slot release before cancellation completed. The ViewModel now uses coalesced stop tasks, run generations, independent teardown and retained work slots.

The narrow-screen contrast audit caught the small secondary-color “01 / LIVE INSPECTION” caption. It now uses white. Both form factors pass the same audit without suppressing findings. Prominent mint buttons use black text; accessibility text sizes switch control groups to vertical layouts.

The initial prototype Vision smoke test had exposed an Espresso GPU-context failure in the simulator. Simulator inference continues to use CPU compute; device inference retains available accelerators.

### Reproducible commands

```sh
xcodegen generate
SPECIFY_FEATURE=001-glasses-inspection bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.5' \
  CODE_SIGNING_ALLOWED=NO test
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Local run evidence (temporary, not committed):
- `/tmp/TrackInspect-FullRun-20261003.xcresult` — final combined tests, with screenshot attachments.
- `/tmp/trackinspect-full-run.log` — final combined test log.
- `/tmp/trackinspect-narrow-final.log` — five narrow-screen UI tests.
- `/tmp/trackinspect-device-final.log` — unsigned device build.

Only app/test build warning: App Intents metadata extraction skipped because no AppIntents dependency exists (expected). Invalid-image/model tests intentionally emit framework decoder/load diagnostics.

## Limits / outstanding acceptance

See [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md). Meta portal credentials, signing/provisioning, glasses video, real ElevenLabs interaction, actual microphone cessation, simultaneous Bluetooth A/V, ten-minute device profiling and hands-on VoiceOver usability remain unvalidated. A paired phone being discoverable is not equivalent to an authorized/provisioned glasses test environment.

No physical-device app was installed, no paid cloud conversation was started, no infrastructure/DNS was modified, and no sibling secrets were copied. `ai.track-inspect.app` is an iOS identity, not a backend configured by this run.

## Earlier baseline

Before the full hardening run, simulator/device compilation and six initial XCTest tests passed. The full-run results above supersede that smaller test count; they do not supersede the outstanding hardware gates.
