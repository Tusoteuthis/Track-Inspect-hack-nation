# Expert/Tutor agent presets — selective integration

Requirement: embed the user-provided public ElevenLabs Expert and Tutor IDs, default Expert for new preferences, preserve existing IDs/manual entry and cloud consent. Never include the ElevenLabs API key.

Plan: port only AgentPreset, its tests, and the two small View changes from the standalone TrackInspect-ios workspace. Keep this repository's newer Mentra adapter and composition unchanged; do not overwrite unrelated Meta integration files.

Tasks: add model/default/buttons; regenerate Xcode project; run unit tests; commit only intended files and push identical main commit to existing GitHub and new private Gitea repository. No hardware/cloud functionality inferred from tests.

Validation: all 31 monorepo unit tests passed after integration (`/tmp/trackinspect-monorepo-tests.log`). UI and real agent calls not retested. Existing local .DS_Store modification excluded from commit. No secrets or build outputs included; generated Xcode project changes limited to new source/test references.
