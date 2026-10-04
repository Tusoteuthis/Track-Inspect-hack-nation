# Data Model

## Current DTOs (`Services/ServiceProtocols.swift`)

### Finding
- `label: String`: model output label and display identity.
- `confidence: Float`: expected model probability in 0...1.
- Derived `id` uses label; supplied classifier results must have unique labels per result.

### AnalysisResult
- `findings: [Finding]`: at most five unique nonempty labels, finite confidence in 0.1...1, sorted by descending confidence (then label for deterministic ties).
- `model: String`: actual model identity.
- `milliseconds: Int`: nonnegative inference duration.
- `capturedAt: Date`: time sampled by the app, not a guaranteed hardware exposure timestamp.
- `context: String`: derived uncertainty-labelled text with timestamp and confidence; no image bytes.

### TranscriptLine
- `id: String`: SDK message identity.
- `speaker: String`: SDK role rendered as text.
- `text: String`: transcript content.
- Adapter publishes latest 100 entries; dashboard displays latest eight. No persistence.

## Session State (ViewModel)

Current implementation uses running/busy/stopping flags and status strings, not a persisted state-machine entity. The following are required logical transitions and test expectations:

- Video: stopped → starting → waiting for frames → live → stopping → stopped.
- Start/stream error: starting/live → error reported → teardown → stopped.
- Voice: idle → connecting → active → ending → idle; failure tears down and reports error.
- A stop during startup cancels pending work. No new start may take ownership while teardown is active.
- Each video and voice run has a generation ID; callbacks from old runs must not publish frames, statuses, errors or transcripts.
- Analysis has a generation ID; stale completions after cancellation must not update results. The running task retains ownership of its slot until it actually returns.
- At most one latest-selected replacement photo can wait; live frames drop when busy. Replacing a photo does not create another in-flight request.
- Retained video/voice stop tasks coalesce concurrent callers; all await the same teardown.
- Background invalidates both pipelines synchronously and begins independent shutdown; slow video cleanup cannot delay initiating voice stop.
- `SessionTiming` holds production intervals; injected monotonic elapsed time makes rate-limit/watchdog boundaries testable.

## Preferences and Retention

- Public agent ID: UserDefaults; not an API key.
- Share-findings toggle: in-memory, false at app launch and reset on backgrounding; never implied by voice consent. Disabling cancels pending context work without releasing its task slot prematurely.
- Last analysis/context/frame timestamps: in-memory throttling and watchdog state.
- Meta credentials: optional local ignored xcconfig, injected into app plist for SDK configuration; never an ElevenLabs secret store.
- Preview/results/transcripts: transient memory. Stop clears preview and analysis; transcript may remain on screen until next voice start or process termination.
