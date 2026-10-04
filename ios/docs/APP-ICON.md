# TrackInspect app icon

Added 2026-10-03 under Spec Kit feature `003-app-icon`.

Original artwork: two perspective rails and sleepers inside a violet viewfinder, on a softly illuminated charcoal background. No text, third-party branding or baked-in outer mask. Matches the Linear-inspired interface.

- [1024×1024 master](../TrackInspect/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png)
- [Simulator home-screen preview](screenshots/app-icon-home.png)
- Asset: `TrackInspect/Assets.xcassets/AppIcon.appiconset/`
- Regenerate: `swift scripts/generate-app-icon.swift` from the project root.

## Validation

- All 18 iPhone/iPad/marketing slots reference generated files; 13 unique resolutions, 20 through 1024 pixels.
- Renderer and ImageIO validate square dimensions and no alpha; master independently verified as RGB/1024×1024/opaque using `sips`.
- Master, 60 px rendition and simulator home-screen appearance visually reviewed.
- XcodeGen uses `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`.
- **32 unit tests passed**, including two new compiled-icon metadata/rendering tests. UI behavior was not changed; full UI suite was not rerun for this asset-only change.
- Signed iOS device build and deep/strict signature verification passed.
- Built device plist contains `CFBundleIcons` and `CFBundleIcons~ipad` with `CFBundleIconName = AppIcon`.
- Xcode emits an informational notice for the legacy iPad 76×76@1x slot and the usual unused App Intents metadata warning; no asset compilation errors.

The first metadata test used Bundle's device-qualified convenience lookup, which hides the other idiom on the running simulator. It now validates both entries from the actual compiled Info.plist; the test passes without skipping either idiom.

## Build

`project.yml` already specified **0.1.0 (3)** when work began. That version was preserved, not reverted or independently incremented. Existing `build/0.1.0-3/` artifacts were not overwritten.

Icon-enabled, development-signed artifacts:
- `build/0.1.0-3-icon/TrackInspect.app`
- `build/0.1.0-3-icon/TrackInspect-0.1.0-3-development.ipa`

The simulator home-screen icon was checked. In the subsequent user-requested deployment on 2026-10-03, **0.1.0 (3) was rebuilt, installed and launched successfully on the original iPhone 16 Pro Max** (`ai.track-inspect.app`).

The old incremental output failed signature verification because its sealed `Assets.car` had changed. A fresh build in `/tmp/TrackInspect-device-install` passed deep/strict signature verification and was the artifact installed. Build log: `/tmp/trackinspect-device-install.log`. Installation and launch do not establish live glasses/voice functionality; no capture was started by the deployment commands.

Local build/test logs: `/tmp/trackinspect-icon-tests-final.log`, `/tmp/trackinspect-icon-device.log`.
