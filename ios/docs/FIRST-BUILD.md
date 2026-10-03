# First development build

Built 2026-10-03 with Xcode 27.0.

- App: TrackInspect
- Bundle identifier: `ai.track-inspect.app`
- Version/build: **0.1.0 (1)**
- Configuration: **Debug, Apple Development signed**
- Target: connected iPhone 16 Pro Max
- Build and deep/strict code-signature verification: **passed**

## Artifacts

Generated locally under the gitignored `build/0.1.0/` directory:

- `TrackInspect.app` — signed physical-device application.
- `TrackInspect-0.1.0-1-development.ipa` — development package (~19 MB), containing the signed app under `Payload/`.

IPA SHA-256:

```text
22c188e78d826faeaf8e35f7e9646fe15e5a54c81ac0f078b9a1aafb22b1a59d
```

This is a development-signed package for devices allowed by its provisioning profile, **not** a TestFlight/App Store distribution export or a publicly installable download. No physical-device installation or live capture was performed. The simulator version was installed and launched successfully.

## Build / install

The build used the development certificate already available in the local keychain, with the team supplied on the command line and automatic provisioning enabled. No team identifier or signing secret was added to tracked configuration.

```sh
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -configuration Debug -destination 'id=YOUR_IPHONE_UDID' \
  -derivedDataPath /tmp/TrackInspect-device-build \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  CODE_SIGN_STYLE=Automatic build

# When ready to install on your provisioned iPhone:
xcrun devicectl device install app --device YOUR_IPHONE_UDID \
  build/0.1.0/TrackInspect.app
```

## Configuration still needed

The signed build contains **no Meta app credentials**. Photo-based local analysis can run immediately; real glasses access requires adding TrackInspect's Meta configuration to `TrackInspect/Config/Secrets.xcconfig` and rebuilding. Enter a public ElevenLabs agent ID in the app to enable voice.

Signing/provisioning for this development build is now verified. T010/T011/T012/T018 remain open because real glasses, live agent behavior, privacy and sustained performance have not been tested. See `HARDWARE-VALIDATION.md`.
