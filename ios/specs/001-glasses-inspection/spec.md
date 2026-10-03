# Feature Specification: Glasses Inspection Base App

**Feature ID**: `001-glasses-inspection` (no Git branch created; directory is not a repository)  
**Created**: 2026-10-03  
**Status**: Local implementation and automated validation complete; hardware/cloud acceptance blocked (see execution.md)  
**Input**: Build a native iOS base app using Meta Ray-Ban SDK video, local live analysis and ElevenLabs conversational voice, following SaveVision and Stozn's stack. Use Spec Kit for plans.

This specification records already implemented prototype behavior and defines outstanding acceptance criteria. It does not imply that hardware/cloud integration has been validated.

## Clarifications — Full Run

- User requested full Spec Kit execution and `ai.track-inspect.app`. In this iOS context it is used as the application bundle identifier, not an invented backend hostname; the Meta return scheme remains `trackinspect://`.
- Execute all locally possible hardening, identity, build, test and UI validation work. Hardware/cloud acceptance stays blocked until a provisioned iPhone/glasses and agent credentials are available.
- Background teardown must initiate voice and video shutdown independently, without waiting for video cleanup before ending microphone capture.
- An in-flight synchronous inference retains its slot until it returns even after cancellation. Repeated photo selection retains only the latest replacement; live frames are dropped while inference is busy.
- Context opt-out cancels pending work; already handed-off network messages cannot be recalled. No subsequent send may start while an old send is still in flight.

## User Scenarios & Testing

### US1 — View and analyze the glasses feed (Priority: P1)

An inspector pairs glasses, starts video and sees a preview with recent local classifications.

**Why this priority**: Receiving and processing the wearer's view is the central workflow.

**Independent Test**: Pair real supported glasses, stream without voice enabled, and verify local results continue without an internet connection once pairing is complete.

**Acceptance Scenarios**:
1. **Given** configured Meta access and available glasses, **when** the user approves pairing and starts video, **then** live frames and timestamped analysis appear.
2. **Given** no glasses credentials, **when** the user selects a test photo, **then** local analysis works without starting camera or microphone capture.
3. **Given** lost frames or disconnection, **when** the stream fails, **then** a recoverable error appears and stale analysis is cleared.

### US2 — Converse with a voice assistant (Priority: P1)

An inspector starts an agent conversation, asks questions, hears replies and can mute or end the call.

**Why this priority**: Two-way audio is the second core product requirement.

**Independent Test**: Configure a public agent and use phone audio without a glasses video session.

**Acceptance Scenarios**:
1. **Given** an agent ID, **when** the user accepts cloud voice transmission and microphone permission, **then** a two-way conversation and transcript become available.
2. **Given** an active call, **when** the user mutes or ends it, **then** microphone transmission is muted or stopped respectively.
3. **Given** available Bluetooth audio, **when** the user selects glasses audio, **then** the actual input/output route is displayed, without assuming glasses selection succeeded.
4. **Given** simultaneous glasses video and voice, **when** audio competes with the camera, **then** the app reports the failure and provides phone-audio fallback.

### US3 — Give the agent visual context (Priority: P2)

An inspector opts in to sharing recent local classifications so the agent can reference what was observed.

**Why this priority**: Connects the two independent pipelines without uploading images.

**Independent Test**: Use a mock voice service and local photo inference to verify consent and summary content.

**Acceptance Scenarios**:
1. **Given** default settings, **when** analysis completes during a call, **then** no visual summaries are sent.
2. **Given** sharing enabled, **when** analysis completes, **then** bounded-rate text summaries include timestamps, confidence and uncertainty, but no images.
3. **Given** sharing turned off, **when** subsequent analysis completes, **then** no new summaries are enqueued; previously transmitted context cannot be recalled.

### Edge Cases

- Missing Meta credentials, denied camera/microphone permission, unavailable glasses or stale selection.
- Glasses in their case, firmware incompatibility, camera session ended by another app/audio consumer.
- Start cancelled, repeated stop, backgrounding during startup, immediate restart after teardown.
- Agent unavailable, network loss, audio interruption or Bluetooth route changes.
- Invalid custom model, low-confidence classifications, slow inference and thermal pressure.

## Requirements

- **FR-001**: Pair via the Meta companion app and handle TrackInspect's return URL.
- **FR-002**: Provide live glasses preview with explicit start/stop, stalled-frame detection and restartable failure states.
- **FR-003**: Analyze images locally without any video/image upload.
- **FR-004**: Display the model identity, latest result time and confidence; label default results as general classifications, not defect detection.
- **FR-005**: Support photo-based local testing independent of hardware credentials.
- **FR-006**: Support public ElevenLabs agent conversations, explicit consent, microphone permission, transcripts, mute and stop.
- **FR-007**: Display actual audio routing and allow requesting phone or glasses Bluetooth input.
- **FR-008**: Make text context sharing separately opt-in, bounded-rate and uncertainty-labelled.
- **FR-009**: Stop capture on backgrounding and require explicit user action to restart.
- **FR-010**: Keep image processing bounded and cancellation-safe; never accumulate an unbounded inference queue.
- **FR-011**: Keep API keys out of the app and real Meta configuration out of source control.
- **FR-012**: Demonstrate full glasses A/V operation on real hardware before claiming hands-free operation.
- **FR-013**: Use `ai.track-inspect.app` consistently as the iOS bundle identifier in generated builds and setup instructions; do not introduce a backend endpoint from this identifier.
- **FR-014**: Support readable controls at accessibility text sizes and narrow widths, labelled icon controls and non-color status indicators; validate with simulator UI tests and layout review.

### Key Entities

- **Video session**: source, lifecycle, last-frame time, error and current preview.
- **Analysis result**: model identity, capture timestamp, latency, label/confidence findings.
- **Voice conversation**: lifecycle, active route, mute state, bounded visible transcript.
- **Sharing preference**: session-local permission to send derived text, disabled by default.

## Success Criteria

These are acceptance targets, not measured hardware results.

- **SC-001**: On the recorded supported hardware combination, complete pairing → live preview → first local result without relaunching the app.
- **SC-002**: During a 10-minute video session, analysis remains responsive with no growing inference backlog; record latency, memory and thermal observations.
- **SC-003**: Complete a 10-turn agent conversation and verify mute, stop and the actual glasses/phone microphone route.
- **SC-004**: Complete a 10-minute simultaneous glasses-video/Bluetooth-voice session, or explicitly classify that configuration unsupported and verify phone-audio fallback. Fallback alone does not satisfy full hands-free acceptance.
- **SC-005**: Automated tests verify no context without opt-in, startup cancellation and failure-state recovery.
- **SC-006**: In a controlled privacy review, confirm no image upload and no microphone capture after end/background.

## Scope and Assumptions

The first version is foreground-only, uses a public agent and a general local classifier. A trained track-defect model, private-agent backend, recordings, background capture, Matrix chat and store distribution are not part of this baseline. Physical hardware, Meta portal access and an ElevenLabs test agent are prerequisites for outstanding acceptance. No domain-model accuracy target is claimed or invented.
