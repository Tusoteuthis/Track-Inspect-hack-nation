# Feature Specification: WS3 Sprint 0 — Capability Spike, Shared Contracts & Test Foundation

**Feature Branch**: `worktree-ws03-sprint-0`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "WS3 Sprint 0 — ElevenLabs capability spike, shared v0 data contracts, fixtures and test runner." Full scope is in `notes/ws3-sprints/sprint-0-spike-contracts.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sprint agents build on verified voice-platform facts (Priority: P1)

A WS3 sprint agent starting Sprints 1–4 needs to know which voice-platform mechanisms really exist before designing anything. These are: how to tell the agent about a pointing event without forcing it to speak, how to link a question to an event, how to wait for a pause, how to switch phases, how to capture timing, and what can be kept off the record. The agent reads one reference document with sourced answers and a recommended mechanism, plus a fallback, for each need.

**Why this priority**: every later sprint depends on these facts. Building on assumed platform features is the largest schedule risk.

**Independent Test**: open the capabilities document and check:
- all ten questions are answered, each with a source
- each of the six needs has a recommended mechanism, a fallback, and a VERIFIED or DOCUMENTED-ONLY label

**Acceptance Scenarios**:

1. **Given** the capabilities document, **When** a sprint agent looks up "deliver a pointing event without forcing a reply", **Then** it finds a recommended mechanism, a fallback and a label saying whether it was tested.
2. **Given** a question the official sources don't answer, **When** the document covers it, **Then** it says "not documented" instead of guessing.

---

### User Story 2 - Partner workstreams review one shared data contract (Priority: P1)

The owners of WS2 (capture), WS5 (knowledge/tutor) and WS6 (backend) review a single human-readable description of the records WS3 consumes and produces: pointing events, exchanges, coverage, open questions, draft revisions, confirmations, session completion, timing marks and recording segments. Each record's fields, allowed values and null rules are listed, along with the open questions addressed to each partner.

**Why this priority**: the workstreams run in parallel. Agreeing the formats early prevents incompatible implementations.

**Independent Test**: a partner reads the contract document and can tell, for every field, its meaning, whether it can be unknown (null), and which workstream produces it.

**Acceptance Scenarios**:

1. **Given** the contract document, **When** WS2 checks the pointing-event record, **Then** session time and signal time are distinct fields, region geometry declares its coordinate space, and ambiguity is an explicit status.
2. **Given** the contract document, **When** WS5 checks exchanges and confirmations, **Then** expert words are verbatim fields separate from AI notes, and confirmations reference an exact revision.

---

### User Story 3 - Development can proceed on labeled sample events (Priority: P2)

Until live capture works, developers need realistic sample pointing events that cover the important cases:
- a clear region
- a second channel
- a repeated gesture at the same spot
- an ambiguous region
- an off-record event

Every sample is labeled as a fixture and carries no interpretation of the trace.

**Why this priority**: it unblocks Sprints 1–2 without waiting for WS2 hardware.

**Independent Test**: load each sample event and check that it passes validation, is marked as a fixture, and has a visibly labeled placeholder image.

**Acceptance Scenarios**:

1. **Given** the five sample events, **When** they are validated, **Then** all pass and all are marked `fixture`.
2. **Given** an invalid event (missing id, unknown mapping status, region outside the frame), **When** it is validated, **Then** it is rejected with a reason.

---

### User Story 4 - Automated checks exist for all later logic (Priority: P2)

Sprint agents need a working automated test command so that pure logic can be developed test-first and verified without a human.

**Independent Test**: run the project's test command; it runs at least the transcript sanity test and the contract validation tests, and they pass.

**Acceptance Scenarios**:

1. **Given** the project, **When** the test command runs, **Then** the transcript behavior (a final line replaces a tentative line of the same speaker; exact repeats are skipped) is verified.

### Edge Cases

- A sample event whose region touches the frame edge (values exactly 0 or 1) is valid. Values below 0, above 1, or with x + width > 1 are invalid.
- A pointing event with an unknown trace or channel uses `null`, never a guessed value.
- A signal interval is either fully present (start, end, unit, with start ≤ end) or `null`.
- A capability question has conflicting doc statements: both are quoted, and the document says which one was verified.
- An empirical check would require creating platform resources: a temporary resource may be used only if it is deleted afterwards, and the deletion is confirmed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The capability reference MUST answer the ten defined platform questions (Q1–Q10), each with a quoted source (doc URL or SDK file path), or state "not documented".
- **FR-002**: The capability reference MUST recommend a mechanism and a fallback for each of six needs: event delivery, question↔event linkage, pause-aware release, phase switching, timing capture, off-record. Each recommendation MUST be labeled VERIFIED or DOCUMENTED-ONLY.
- **FR-003**: The project constitution MUST be ratified with no unfilled template placeholders (done in this sprint: v1.0.0).
- **FR-004**: The shared contract MUST define nine record types: PointingEvent, ExpertExchange, CoverageItem, OpenQuestion, DraftRevision, ExpertConfirmation, SessionCompletion, TimingMark and RecordingSegment, with the fields and allowed values given in the sprint prompt, and a schema version `ws3.v0`.
- **FR-005**: Records arriving from outside WS3 (pointing events) MUST be validated, and invalid input MUST be rejected with human-readable reasons.
- **FR-006**: Five sample pointing events MUST exist (resolved SYS1, resolved SYS2, repeat of the first, ambiguous, off-record). All are labeled fixture and share one fixture session id, and the images they reference visibly say FIXTURE.
- **FR-007**: Sample events and placeholder images MUST NOT encode any interpretation of the trace.
- **FR-008**: An automated test command MUST exist and cover the transcript sanity behavior, validation of every sample event, and rejection of the invalid cases.
- **FR-009**: A human-readable contract summary MUST exist for partner workstreams, marked "v0, pending agreement", with open questions per partner (WS2, WS5, WS6).
- **FR-010**: A handoff note MUST record what was delivered, the verification output, decisions, limitations and the human-gate checklist.

### Key Entities

- **PointingEvent**: one gesture toward a screen region. Identity, session time vs. capture time, frame references, normalized region in a declared coordinate space, mapping status, optional trace/channel/signal interval, recording state, source (live or fixture).
- **ExpertExchange**: one question and the expert's verbatim answer lines, linked to one event (or none), with phase, kind, timing and recording state.
- **CoverageItem**: whether a knowledge dimension (decision, reason, cues, alternatives, guardrails, unresolved) is missing, partial or covered for an event, with the supporting exchanges.
- **OpenQuestion**: a missing fact, why it matters, related events and exchanges, and which exchange later answered it.
- **DraftRevision**: an immutable, numbered version of the workflow steps, each step citing events and exchanges.
- **ExpertConfirmation**: an explicit confirmed/corrected/unresolved response tied to one exact revision.
- **SessionCompletion**: the end-of-session summary (reason, confirmed revision, coverage, unresolved items, exclusions, question counts).
- **TimingMark**: a timestamped milestone for latency vs. intentional-wait analysis.
- **RecordingSegment**: an on-record or off-record time span.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 10 of 10 capability questions are answered with at least one source each, or explicitly marked "not documented".
- **SC-002**: 6 of 6 needs have a recommended mechanism, a fallback and a verification label.
- **SC-003**: 5 of 5 sample events pass validation, and 3 of 3 deliberately invalid samples are rejected.
- **SC-004**: The full automated check (type check plus tests) completes with zero failures.
- **SC-005**: A partner owner can find, for every contract field, its meaning and nullability in under 5 minutes of reading.
- **SC-006**: Zero interpretations of trace features appear in samples, contracts or images (checked by review).

## Assumptions

- The voice-platform API key is available for empirical checks; agent ids are not yet configured, so no permanent agents are created in this sprint.
- Contracts are a WS3 proposal (v0). Partners may change field names in later agreement, which is handled as a contract version bump.
- The record shapes in `notes/02-glasses-iphone-visual-processing.md` §5 and `notes/05-knowledge-newcomer-tutor.md` §3–5 are the reference for partner expectations.
- Placeholder images are simple generated graphics, not real trace captures.
- Agent prompt, client tools, UI and persistence are out of scope (Sprint 1+).
