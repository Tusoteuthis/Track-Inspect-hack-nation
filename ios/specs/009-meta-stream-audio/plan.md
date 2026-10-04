# Implementation plan — Meta in-stream audio

**Status:** Deferred. Do not begin dependency changes or hardware capture from this plan alone.

## 1. Resolve feasibility before implementation

### Meta SDK / channel gate

- Identify a released iOS SDK version whose public interface actually contains audio-codec configuration, audio frame publication and the required permission controls. Pin the exact verified version; do not guess a minimum version.
- Confirm supported glasses model, firmware and Meta AI versions, plus whether DAM is required. Do not infer this from the previous DAM troubleshooting experiment.
- Verify that this project's development/beta channel has a completed assigned version and that the same Meta account used on the phone accepted its invitation. Resolve existing registration/key failures separately; an SDK upgrade is not proof of repairing them.
- Build a minimal on-device spike receiving video plus audio frames locally. Report only frame counts, format, timestamp continuity and transient levels, never recorded audio.
- Verify the actual frame representation: documentation mentions PCM/16-bit encoding but iOS `pcmBuffer` Float32 samples. Read buffer metadata instead of assuming byte layout.
- If no supported SDK/channel is available, mark blocked and keep the current HFP/iPhone implementation unchanged.

### ElevenLabs external-audio gate

- Inspect the exact ElevenLabs/LiveKit versions for a documented external PCM capture/publication interface and a way to disable default microphone capture. A publicly exposed input track alone is not proof of injectable capture.
- Preferred path: retain the official conversation SDK if external audio can be supplied through supported APIs while preserving transcripts, agent state, mute and interruption.
- Otherwise evaluate the documented ElevenLabs conversation WebSocket protocol, including input format negotiation, audio output format, keepalive, interruption and authorization. Confirm current support before choosing it.
- Do not feed synthetic microphone data through undocumented internals. Do not ship both transports without a demonstrated need.
- Private agents require backend-issued short-lived authorization. Never bundle an ElevenLabs API key. Public-agent transport authentication must also follow documented requirements.

**Deliverable:** a short decision record with exact versions, capability proof, chosen transport, authorization path and known limitations. This is the go/no-go gate.

## 2. Architecture and state model

Preserve SwiftUI → main-actor ViewModel → protocol services. Keep DAT and ElevenLabs types inside adapters.

- Add an SDK-free input choice: system microphone versus Meta camera-stream microphone. Resolve iPhone versus HFP through the existing system-route controls.
- Extend the Meta adapter with bounded audio delivery and an explicit audio-enabled stream configuration. Video-only starts must leave audio disabled.
- Define SDK-free frame metadata (sample rate, channel count, representation, frame count, timestamp, generation). Copy/retain buffers according to the SDK's documented lifetime; never pass unsafe borrowed memory to an asynchronous consumer.
- Add a bounded audio bridge responsible for conversion and delivery to the chosen voice transport. The voice adapter owns uplink publication and reply playback, not a second capture source.
- Track input-source selection, consent, capability readiness, stream startup, agent startup, active, muted, stopping and recoverable failure separately. Registration is not connectivity or microphone readiness.
- Provide actual input activity and output route diagnostics without persisting levels/transcripts/audio. Audio activity does not itself prove server receipt; expose uplink errors separately.

## 3. Audio processing and playback

- Prefer 16 kHz mono from DAT if supported and compatible with the negotiated ElevenLabs input format. Otherwise convert with a tested off-main-actor converter to the negotiated format.
- Explicitly handle Float32/Int16, channel mixing, sample counts, interleaving, clipping and endianness. Do not reinterpret Float32 buffers as Int16.
- Use timestamps/sample counts for ordering and pacing. Bound queued audio (initial target <=200 ms; tune against supported APIs and hardware measurements), with counters and a documented overflow policy. Never accumulate an unbounded latency backlog; repeated overflow should stop with a recoverable error.
- Keep reply playback on the selected system output. Test whether A2DP can coexist with DAT capture; do not force HFP merely to get input when PCM already comes from DAT.
- Validate echo and agent interruption/barge-in. Do not assume default phone/LiveKit echo cancellation still works when input originates in a separate DAT stream, or that this microphone path has HFP's wearer-focused beamforming.

## 4. Privacy and lifecycle

- Explain that microphone audio goes to ElevenLabs while images remain local. Request any new DAT microphone permission separately from the existing iOS microphone permission, according to the verified SDK.
- Require cloud consent before enabling the audio-enabled capture path. Joining an agent or changing presets must not silently enable an additional source.
- Stop old input publication and capture before switching sources. Confirm the selected SDK does not leave its default microphone publishing.
- Mute immediately gates forwarding and clears queued unsent audio. Where capture continues because it shares a video stream, say so explicitly; do not claim the hardware microphone is off. Prefer disabling audio capture when supported without disrupting video.
- On background/lock/end/disconnect, invalidate generation immediately, close ingress, clear queues, cancel conversion/uplink, stop playback and shut down capture. Independent voice/video shutdown must remain bounded; a slow camera stop must not keep transmission alive.
- Unpairing stops all media before SDK authorization removal. Frames arriving late cannot publish to another session.
- Require explicit action after failure; do not automatically enable the phone microphone, reconnect cloud audio or resume recording.

## 5. Settings and recovery

- Add an explicit audio-input choice and capability explanation. Mark the DAT path beta and disable it with a specific reason when unavailable.
- Show `Input: Meta glasses stream` only after real DAT audio arrives. Show `Output:` using the actual system route; do not equate a requested route with an applied one.
- Preserve manual iPhone/HFP fallback, mute and stop controls. Selecting fallback should never bypass microphone/cloud consent.
- Handle shared video/audio lifecycle transparently: if stopping video also ends DAT microphone capture, explain and end that voice path or offer an explicit source switch.

## 6. Validation

### Automated

- Fake audio source/transport tests: no forwarding before consent, no double source, mute/unmute, source switch, canceled startup, duplicate stop, unpair, background, delayed frames and generation changes.
- Conversion tests with deterministic signals: formats/channels, frame count, resampling continuity, malformed/empty buffers and amplitude limits.
- Stress bounded buffering with a slow transport; assert memory/queue bounds and recovery behavior. Verify no stale audio replay.
- Verify transcript/state/mute integration for Expert and Tutor without embedding secrets or requiring live agents in unit tests.
- UI tests: capability unavailable, consent cancel, input choice, actual route labels, accessible activity indicator, error recovery and Dynamic Type.
- Run existing Meta, Mentra, inference, privacy and lifecycle tests after any dependency upgrade.

### Physical-device acceptance

Record exact iPhone/iOS, glasses/firmware, Meta AI, DAT/ElevenLabs versions, selected channel and account eligibility (no secrets).

1. Audio/video reception with the phone away from the wearer proves glasses input rather than phone capture.
2. Wearer speech appears in server-side conversation/transcript evidence with consent; agent responses reach glasses speakers.
3. Compare DAT+A2DP, system HFP and iPhone fallback; observe actual routes and frame continuity.
4. Test quiet/noisy scenes, echo, interruption and at least a 10-minute combined video/voice session; record latency, frame rate, gaps, thermal behavior and battery observations.
5. Exercise mute, route change, competing audio, Wi-Fi/mobile transitions, network loss, glasses removal, folding, background/lock, unpair and explicit restart.
6. Verify no uplink after mute/stop/background using transport counters/instrumentation, not merely the UI label. Do not capture real audio for debugging without separate explicit consent.

## 7. Rollout and rollback

Keep current input as the default until hardware acceptance passes. Ship the new path as explicit opt-in, retain a known-good build/dependency lockfile, and document rollback. Enable it by default only after a separate decision supported by measurements. No production-readiness claim while Meta limits it to beta/development channels.

## Sources / research starting points

- Meta developer documentation: https://wearables.developer.meta.com/docs/develop/
- Meta documentation export: https://wearables.developer.meta.com/llms.txt?full=true — “Use device microphones and speakers” / “Capture audio while streaming from the camera”. Recheck at implementation time; the section is feature-gated.
- Pinned DAT 0.7.0 `MWDATCamera.swiftinterface`: no `audioCodec`/`audioFramePublisher` in the current checkout.
- ElevenLabs Swift SDK: https://github.com/elevenlabs/elevenlabs-swift-sdk — verify external input against the exact chosen release.

## Constitution / consistency review

Native boundaries, local images, separate cloud consent, bounded processing and secret hygiene are preserved. No exceptions proposed. R1 maps to feasibility; R2/R3/R6 to source/lifecycle tests; R4 to UI and hardware route verification; R5 to conversion/buffering tests; R7 to regressions/rollback. Hardware acceptance is deliberately unchecked.
