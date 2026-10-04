# Service and External Boundary Contracts

Canonical Swift declarations: `TrackInspect/Services/ServiceProtocols.swift`.

## VideoService — main actor

- `register() async throws`: initiates companion-app registration; no automatic capture.
- `handle(url:) async throws`: handles only TrackInspect's Meta callback scheme.
- `start() async throws`: creates a new capture session; returning means stream startup requested, not proof of first frame.
- `stop() async`: invalidates old callbacks and releases listeners, stream and session; repeat calls are safe.
- `onFrame(UIImage)`: preview/inference input, never a network upload.
- `onStatus(String)` / `onFailure(String)`: user-visible lifecycle/error messages.
- Failure to receive frames for 12 seconds is handled by the ViewModel watchdog.

## AnalysisService — Sendable

- `analyze(jpeg: Data, capturedAt: Date) async throws -> AnalysisResult`.
- JPEG is local input; no network dependency or upload.
- Actor serializes inference; ViewModel samples live video at >=750 ms intervals and drops frames while an analysis is active. Cancelled synchronous inference retains its slot until return; only one latest replacement photo may wait.
- Optional bundled model must accept one image with no other required inputs, declare a predicted string/integer label and dictionary probabilities, and output classification observations. Invalid models throw rather than masquerading as successful generic inference.
- Cancellation/stale generation must prevent UI publication even if a synchronous framework request cannot be interrupted immediately.

## VoiceService — main actor

- `start(agentID:) async throws`: validates a nonempty public ID and requests microphone permission; caller obtains cloud-transmission consent first.
- `stop() async`: releases SDK conversation/subscriptions; repeat calls are safe.
- `setMuted(Bool) async throws`: changes active conversation microphone state.
- `updateContext(String) async throws`: sends text only during an active conversation.
- Status, transcript and mute callbacks expose app DTOs, not SDK types.
- ElevenLabs/LiveKit owns audio capture/playback. No claim that DAT frames include microphone samples.

## Visual Context Envelope (text, not a backend schema)

Includes a capture timestamp, labels, confidences and explicit uncertainty/safety disclaimer. Text is data, not trusted instructions. Default is no transmission. Caller enforces >=5 seconds between sends and at most one context send in flight. Disabling sharing prevents new sends; messages already handed to the transport cannot be recalled.

## Configuration / External Interfaces

- Application bundle ID: `ai.track-inspect.app`. This is not a configured network endpoint.
- Meta callback: `trackinspect://`; registered with matching app/team identity.
- Agent configuration: public ID only. No custom backend endpoint exists in baseline.
- Audio route controls request built-in mic/speaker or Bluetooth HFP; actual `AVAudioSession.currentRoute` remains authoritative.
- Background lifecycle synchronously invalidates callbacks, resets context sharing and starts video/voice teardown independently; it never silently resumes capture.

## Contract Test Evidence

`LifecycleTests` and `PrivacyTimingTests` cover rapid restart while stopping, coalesced teardown, stale frame/status/transcript/analysis rejection, rate limits, opt-out cancellation, bounded inference/context work, voice cancellation/failure and independent background teardown. `ClassifierContractTests` covers malformed input and optional model boundary failures. `InspectionUITests` exercises visible consent and actionable empty configuration.

Physical tests remain required for SDK callback timing, audio route truth and actual microphone cessation; mocks and simulator audits cannot prove those properties.
