# Research: Glasses Inspection Base App

## Native stack
- **Decision**: Swift 6, SwiftUI/Observation, protocol services, XcodeGen and SPM.
- **Rationale**: Matches the requested sibling app architecture without copying unrelated Matrix features or credentials.
- **Alternatives considered**: Copying an entire template would import unrelated transport, identities and infrastructure; cross-platform UI would diverge from the request.
- **Evidence**: `project.yml`, current app structure, sibling documentation examined during initial implementation.

## Meta capture
- **Decision**: DAT 0.7.0, retained selector, resolved-device session, wait for `.started`, attach camera capability, rebuild after stop.
- **Rationale**: SaveVision documents selector races and non-restartable stopped sessions.
- **Alternatives considered**: Custom Bluetooth camera transport is unnecessary; continuously restarting failed sessions masks device-side contention.
- **Evidence**: `MetaVideoService.swift`; `../savevision-ios/RAYBAN_DAT_INTEGRATION.md`.

## Local model
- **Decision**: Built-in Vision classification, optionally a bundled `InspectionClassifier.mlmodelc` image classifier.
- **Rationale**: Immediately testable local inference without model downloads or a fabricated domain model. Actor serialization and frame sampling keep work bounded.
- **Alternatives considered**: Cloud vision violates local-video requirements; detector/VLM requires a different result contract and explicit model selection.
- **Evidence**: `LocalAnalysisService.swift`, passing real-inference smoke test. Simulator uses CPU after an Espresso GPU-context failure; device uses available accelerators.

## Voice transport and auth
- **Decision**: Official ElevenLabs Swift SDK 3.4.0 with public agent ID for baseline.
- **Rationale**: Provides native microphone, playback, transcripts and mute using LiveKit. Avoid duplicating PCM/WebSocket framing and echo handling.
- **Alternatives considered**: Private agent tokens require an authenticated backend not yet specified. Never substitute an embedded API key.
- **Evidence**: `ElevenLabsVoiceService.swift`; https://github.com/elevenlabs/elevenlabs-swift-sdk/tree/v3.4.0.

## Audio/video coexistence
- **Decision**: Show actual system route, request HFP or phone audio, gate hands-free claims on physical acceptance.
- **Rationale**: DAT video does not supply microphone audio in this design. SaveVision reports glasses camera termination when competing audio takes control.
- **Alternatives considered**: Assuming all Bluetooth audio routes preserve the camera would misrepresent capability.
- **Unresolved empirical result**: Compatibility of the user's exact glasses/firmware/iPhone combination. Resolve through T011, not speculation or simulator tests.

## Privacy and lifecycle
- **Decision**: Foreground-only, explicit voice consent, separate context opt-in, no app recordings, no image upload.
- **Rationale**: Minimal capture surface for a first prototype.
- **Alternatives considered**: Background audio/video and persistent inspection evidence require separate retention, permissions and lifecycle designs.

No unresolved product choice blocks the baseline plan. Hardware support and domain-model accuracy remain unproven, explicitly gated capabilities rather than assumed research conclusions.
