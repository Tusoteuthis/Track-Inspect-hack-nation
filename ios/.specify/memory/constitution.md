# TrackInspect Constitution

## Core Principles

### I. Native, Layered Architecture
Use Swift 6 strict concurrency, SwiftUI and Observation on iOS 17+. Views call ViewModels; ViewModels call protocol-defined services. Meta and ElevenLabs SDK types stay inside their adapters. XcodeGen and SPM define reproducible builds. SDK-specific Combine bridges are allowed inside adapters, not as a second application architecture.

### II. Privacy by Default
Video and image inference MUST remain on the iPhone. The single exception is the annotated pointing-target screenshot, which MAY be sent to the operator's own Passiv gateway for description, only while its dedicated switch is on and a Passiv key is configured; the switch is on by default at the owner's direction and the user can turn it off. No other frame is uploaded. Cloud microphone transmission requires explicit consent. Sending local findings as text requires separate opt-in, disabled by default. No recordings or transcripts are persisted by the prototype. Stop capture when backgrounded; no automatic recording on return.

### III. Bounded and Cancel-Safe Processing
Inference runs off the main actor with at most one active request and no unbounded frame queue. Capture and conversation startup must be cancellable. Errors, denied permissions, disconnection and stalled streams must lead to recoverable UI states. Test lifecycle transitions.

### IV. Honest Model Capability
General image classifications MUST NOT be presented as trained railway defect detection, safety certification, or validated visual reasoning. Domain models require an explicit input/output contract and separate accuracy evaluation before safety-related claims.

### V. Hardware Evidence Before Capability Claims
DAT video and Bluetooth conversational audio coexistence MUST be tested on the actual iPhone/glasses/firmware combination. Display the actual iOS route; never assume the active microphone is on the glasses. Keep phone-audio fallback. Simulator success is not hardware acceptance.

### VI. Secure Configuration
Never embed ElevenLabs API keys or copy credentials from sibling apps. Meta configuration belongs in ignored local configuration. Private-agent access requires backend-issued short-lived credentials and its own security design. Do not log secrets, audio or image data.

### VII. Spec-Driven Delivery
Use Spec Kit for planning: specification → clarification when necessary → research/plan/design → tasks → consistency analysis → implementation and validation. Record retrospective implementation honestly; checked tasks need evidence. Leave unperformed hardware validation unchecked. Keep plans, tests and user documentation aligned.

## Quality Gates

- Build simulator and unsigned device targets; run relevant XCTest tests.
- Check accessible labels, Dynamic Type, contrast and status indication independent of color before release.
- Resolve privacy/security violations before implementation. Unproven hardware/model behavior is a documented acceptance gate, not a claimed capability.
- Production distribution, private-agent authentication and domain model training require additional feature specifications.

## Governance

This constitution governs TrackInspect only. Amendments require a rationale and corresponding updates to plans/templates. Existing prototype code predates Spec Kit adoption; its current status is baselined in `specs/001-glasses-inspection/` rather than represented as prior spec-driven work.

**Version**: 1.2.0 | **Ratified**: 2026-10-03 | **Last Amended**: 2026-10-04

Amendment 1.2.0 (2026-10-04): the pointing-screenshot upload is on by default, as the owner asked ("make cloud default"); this weakens privacy-by-default for that one image and is stated in the UI.

Amendment 1.1.0: Principle II gains the opt-in pointing-screenshot exception. Rationale: the owner asked for an LLM description of the pointing target (`specs/010-finger-pointing/`), which on-device labels cannot provide. Principle VI is unchanged in intent; the Passiv key in ignored local configuration is a prototype compromise recorded in that spec.
