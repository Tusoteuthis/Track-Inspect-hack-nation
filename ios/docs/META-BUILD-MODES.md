# Explicit Meta connection mode builds

DAT 0.7 uses **MWDAT.DAMEnabled**, a plist boolean. Runtime SDK parser tests confirmed both values. The earlier `startupOptions.usesDam` entry was ignored, leaving the SDK configuration false; earlier statements that build 6 actually enabled DAM were incorrect.

No supported runtime configuration parameter exists on `Wearables.configure()`. Choose at build time, not through a pretend in-app toggle. Settings → Glasses reports the installed boolean. Canonical Info.plist now enables DAM correctly; helper overrides only its temporary build input.

```sh
xcodegen generate
bash scripts/build-meta-mode.sh legacy -destination 'generic/platform=iOS' -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_TEAM CODE_SIGN_STYLE=Automatic build
bash scripts/build-meta-mode.sh dam -destination 'generic/platform=iOS' -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_TEAM CODE_SIGN_STYLE=Automatic build
```

For simulator testing, pass a simulator destination and `CODE_SIGNING_ALLOWED=NO test`. Helper rejects modes other than dam/legacy and leaves source credentials untouched.

Build 7 artifacts:
- `build/0.1.0-7-legacy/TrackInspect.app` — verified DAMEnabled=false; installed/launched on original phone.
- `build/0.1.0-7-dam/TrackInspect.app` — verified DAMEnabled=true; retained for explicit switch-back/testing.

Both have the same app identity, so only one can be installed at once. Installation preserves app data; does not automatically unregister, reset keys, pair or start capture. Changing modes is an experiment, not a proven repair of authorization failure.

59 unit + 8 UI tests passed on legacy; parser tests cover both flags. Both signed physical builds passed signature verification. Hardware pairing/video remains unverified. See `specs/007-meta-build-modes/tasks.md` for test issues resolved during development and log paths.
