# Meta camera-stream audio for ElevenLabs

**Status:** Proposed / deferred — planning only

## Goal

Use Meta glasses video and microphone audio from the same DAT camera stream, send the microphone audio to the selected ElevenLabs agent, and play the agent's reply through the glasses. Retain the existing iPhone/HFP voice path as an explicit fallback.

## Evidence and limits

Meta's documentation describes beta iOS camera-stream audio using `StreamConfiguration(audioCodec: ...)` and `Stream.audioFramePublisher`, restricted to development/beta release channels. It describes PCM audio, including a 16 kHz mono configuration, with timestamps aligned to video. The section is feature-gated in the documentation; documentation visibility does not establish availability to this project.

The currently pinned DAT **0.7.0** camera interface does not expose these APIs. No compatible released version or firmware/channel eligibility has yet been verified. ElevenLabs Swift **3.4.0** currently owns microphone capture through LiveKit; supported arbitrary PCM injection into that conversation is also unverified.

## User scenarios

1. With compatible SDK, glasses and authorized release-channel access, the wearer explicitly chooses Meta stream audio and consents to cloud voice. The agent hears the glasses microphone while local video analysis continues.
2. The agent's replies play through the actual selected glasses output route. The app displays the verified input source separately from the iOS output route.
3. With unsupported hardware/channel/API, the app explains the limitation and offers an explicit iPhone/HFP fallback without silently switching microphones.
4. On mute, background, disconnection, route loss or end-session, forwarding stops and stale buffered audio cannot reach a later conversation.

## Requirements

- R1: Use only verified, supported SDK/transport APIs. No private API, credential hacks or inference of availability from documentation alone.
- R2: Keep video/images local. Cloud voice requires consent before enabling this microphone-forwarding pipeline. Text-summary sharing remains separately opt-in.
- R3: Exactly one microphone source/uplink per conversation. Never run LiveKit's default microphone alongside DAT PCM forwarding.
- R4: Display input provenance (DAT glasses PCM versus iOS microphone), actual output route, connection/format errors and observable audio activity. Do not label an A2DP output as proof of glasses input.
- R5: Use bounded, generation-scoped processing with negotiated audio format, cancellation and no recording/logging of audio, credentials or full callback URLs.
- R6: Mute stops forwarding immediately. Stop/background ends capture and forwarding without automatic restart; reconnect requires explicit action and fresh consent as appropriate.
- R7: Keep Expert/Tutor selection, normal voice path, Mentra support and local inference functional. No silent fallback or capture caused merely by opening Settings.

## Success criteria

Supported-device testing demonstrates intelligible wearer speech reaching the agent and replies reaching glasses while camera frames continue. Unit/integration tests cover lifecycle, buffering, source exclusivity and privacy. Hardware evidence establishes route behavior, echo/interruption behavior and sustained operation; registration, successful builds and fake frames alone do not meet acceptance.

## Out of scope

Production-channel availability, app-store distribution, always-on/background microphone, recordings, cloud video upload, new defect-detection claims and a general agent/backend rewrite.
