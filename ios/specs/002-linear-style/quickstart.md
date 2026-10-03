# Quickstart

```sh
export SPECIFY_FEATURE=002-linear-style
bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
xcodegen generate
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.5' CODE_SIGNING_ALLOWED=NO test
```

Inspect dashboard, settings, photo action and cancelled voice-consent flow at default and largest Dynamic Type. Repeat UI tests on iPhone SE (3rd generation). Review contrast/label/hit-region audit without suppressing failures.

Use existing local Apple Development identity for build 0.1.0 (2), supplying the team on the command line, never tracked source. Install only TrackInspect (`ai.track-inspect.app`) on the previously selected iPhone. Launch must not start capture. If locked, report installed but not launched. Real glasses/voice still require the configuration described in README.
