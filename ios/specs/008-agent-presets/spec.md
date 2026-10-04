# Expert and Tutor agent presets

User supplied two Track Inspect ElevenLabs agent IDs. Settings must offer explicit Expert/Tutor choices, retain manual agent ID entry and preserve the existing saved selection. Selecting a preset does not initiate voice or bypass cloud consent. No API key is stored. Public agent access remains required by the existing adapter; IDs alone do not establish public accessibility.

Plan: SDK-free preset enum with supplied identifiers; Settings buttons bind the existing persisted agentID; unit tests verify exact values. No dependency, privacy or architecture exceptions. Requirements are unambiguous and map directly to implementation/tests.

Completed: embedded both public IDs in AgentPreset; Expert is the default when no saved agent preference exists; Settings offers Expert/Tutor buttons and preserves manual entry/existing saved values. Selection never starts capture. Regenerated Xcode project. All 60 unit tests passed (`/tmp/trackinspect-agent-presets-tests.log`). UI suite and physical/cloud conversations were not run for this change. Not installed on phone yet.
