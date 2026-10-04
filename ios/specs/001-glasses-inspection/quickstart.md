# Quickstart / Validation

Full setup: [README.md](../../README.md). Local evidence: [docs/VALIDATION.md](../../docs/VALIDATION.md). Blocked physical acceptance: [docs/HARDWARE-VALIDATION.md](../../docs/HARDWARE-VALIDATION.md). Full-run record: [execution.md](execution.md).

## Local prototype

```sh
xcodegen generate
open TrackInspect.xcodeproj
```

Run TrackInspect on an iPhone simulator. Select a photo and verify the general classifier name, confidence and result timestamp. No Meta credentials or cloud connection are needed for this path.

```sh
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.5' \
  CODE_SIGNING_ALLOWED=NO test
```

Select an installed simulator/runtime if that destination is unavailable.

## Physical acceptance

1. Copy the example xcconfig to ignored `TrackInspect/Config/Secrets.xcconfig`; enter TrackInspect's own Meta app/client token and signing team.
2. Register bundle **`ai.track-inspect.app`** and `trackinspect://` return link in Meta tooling; sign/run on an iPhone.
3. Pair, approve access and start video; validate US1 without voice.
4. Enter a public ElevenLabs agent ID; consent and validate US2 with phone audio, then glasses audio.
5. Run simultaneous A/V for ten minutes; record exact iPhone/iOS, glasses model/firmware, route, frame continuity and conversation behavior. If unsupported, record failure and test phone-audio fallback separately.
6. Validate US3 with sharing off/on/off; verify text summaries but no image uploads.
7. Verify stop, lock/background, denied permissions, network loss and restart.

## Spec Kit workflow

```text
/speckit.specify <next feature>
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement
```

Command definitions live in `.claude/commands/`. These are workflow instructions; command discovery depends on the agent host. They can also be read and followed manually.

This workspace currently has no Git repository; scripts support that mode. Explicitly choose the active feature when running scripts:

```sh
export SPECIFY_FEATURE=001-glasses-inspection
bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

Do not rerun `setup-plan.sh` on a filled plan unless intentionally regenerating it: it copies the template over `plan.md`. Global `specify` initialization was unavailable due to an installed Python CPU-architecture mismatch; local workflow scripts/templates were bootstrapped from the user's existing Spec Kit setup in `stoz3n-ios-chat`, with TrackInspect-specific constitution and plan gates. No global tool installation was changed.
