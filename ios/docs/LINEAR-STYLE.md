# Linear-inspired interface — 0.1.0 (2)

Implemented 2026-10-03 under Spec Kit feature `002-linear-style`.

## Visual changes

- Compact inline navigation and workspace heading instead of the oversized title/banner.
- Charcoal background, layered neutral panels, fine borders and 8–12 pt corners.
- Violet primary video action, neutral secondary controls, restrained status badges.
- Subtle camera framing/grid and a compact glasses empty state.
- Consistent analysis, voice, transcript and setup panels.
- Shared native SwiftUI theme/components; no external assets, logos, web views or dependencies.
- Semantic typography, stacked large-text controls and minimum 44 pt action targets.

Service/ViewModel code, app identity, persisted agent ID, cloud consent and separate summary opt-in are unchanged. The application identifier now has a descriptive accessibility label/value rather than an interactive unlabeled technical string.

## Screenshots

[Dashboard](screenshots/linear-dashboard.png) · [Setup](screenshots/linear-setup.png) · [iPhone SE](screenshots/linear-iphone-se.png)

## Validation

- **30 XCTest + 7 XCUITest tests passed** on iPhone 16 / iOS 18.5.
- The same **7 UI tests passed** on iPhone SE (3rd generation) / iOS 18.5.
- Default and largest accessibility-text layouts reviewed; controls remain scroll-reachable.
- Dashboard and scrolled settings contrast, element-description and hit-region audits passed without ignoring audit findings.
- Audits prompted a brighter routing explanation, a readable field prompt and a descriptive application-identifier accessibility label. The bundle ID is informational rather than a tiny selectable-text target.
- Signed generic iOS build and deep/strict code-signature verification passed.
- Only expected App Intents metadata extraction warning in app/test build targets.
- Spec/plan/task coverage: five requirements mapped; no constitution exceptions. Real glasses and cloud-agent acceptance remain outside this presentation-only change.

Local logs: `/tmp/trackinspect-linear-complete.log`, `/tmp/trackinspect-linear-narrow.log`, `/tmp/trackinspect-linear-device-final.log`.

## Build and deployment

Bundle: `ai.track-inspect.app`. Version: **0.1.0**, build **2**.

Development-signed local artifacts:

- `build/0.1.0-2/TrackInspect.app`
- `build/0.1.0-2/TrackInspect-0.1.0-2-development.ipa`

The previously targeted iPhone 16 Pro Max became unavailable. Installation was attempted against that same device and failed with CoreDevice error 4016 (trusted device connectivity unavailable). **Build 2 is not installed on the physical phone.** No other available phone was substituted. Reconnect/unlock the original iPhone and run:

```sh
xcrun devicectl device install app --device YOUR_IPHONE_UDID build/0.1.0-2/TrackInspect.app
xcrun devicectl device process launch --device YOUR_IPHONE_UDID ai.track-inspect.app
```

The update does not initiate camera or microphone capture automatically. Meta configuration and ElevenLabs agent setup remain required for real sessions.
