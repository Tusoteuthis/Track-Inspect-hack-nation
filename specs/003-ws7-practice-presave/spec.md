# Feature Specification: WS7 Sprint 2 — Newcomer practice and the pre-save review loop

**Feature Branch**: `ws7-sprint-2`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: WS7 Sprint 2 prompt (`notes/ws7-sprints/sprint-2-practice-presave.md`). This covers brief §3.E: the newcomer practice screen, a review state machine that is current only while the draft is unchanged, tutor voice integration and browser screen observation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A wrong decision is caught before it is saved (Priority: P1)

A newcomer opens an unseen trace and drafts a decision with a reason, optionally marking a rectangle on the trace, then asks for review. The tutor reports that guidance is needed, gives a guiding question and cites an expert example. The newcomer opens that example, corrects the draft and asks for review again. Only once the review is complete for the current draft can they save, and the screen shows "Saved" only after the save is acknowledged.

**Why this priority**: This is the challenge's key moment. Without it there is no demonstrable pre-save correction.

**Independent Test**: Run on fixture data: wrong draft → guidance with citation → inspect example → edit → review complete → save → saved.

**Acceptance Scenarios**:

1. **Given** a fresh draft, **When** the learner requests review, **Then** the status shows "Review pending" and Save is disabled with a reason.
2. **Given** guidance is needed, **When** the learner opens a citation, **Then** the cited expert example (trace image with region and the expert's verbatim quote) opens in a dialog that is labelled as an expert example.
3. **Given** the review is complete, **When** the learner edits the draft, **Then** the status shows "Draft changed / not yet reviewed" and Save is disabled.
4. **Given** the review is complete, **When** the learner clicks Save twice quickly, **Then** exactly one commit is sent.
5. **Given** a save is in flight, **When** no acknowledgement has arrived yet, **Then** "Saved" is not shown anywhere.
6. **Given** a save fails, **When** the failure is reported, **Then** an alert with a Retry action is shown and the state is not "Saved".

---

### User Story 2 - Reviews never go stale silently (Priority: P1)

An evaluation applies only to the exact draft revision and knowledge revision it assessed.

**Independent Test**: Reducer table tests and component tests with an injected data source.

**Acceptance Scenarios**:

1. **Given** a review was requested for revision N, **When** the evaluation for revision N arrives after the learner has edited to revision N+1, **Then** it is ignored.
2. **Given** the review is complete, **When** the knowledge revision changes, **Then** the review is invalidated and Save is disabled.

---

### User Story 3 - Tutor voice and screen observation (Priority: P2)

The learner can start a voice session with the tutor. The screen shows the agent's status (listening / speaking / waiting / disconnected) and, separately, the microphone permission. The learner can share their screen so that visual context reaches the tutor through a verified route, with clear permission, active-sharing and stopped states. Structured UI events (draft edited, review requested, evaluation received, saved) are also sent as silent context; they supplement the visual context and do not replace it.

**Independent Test**: Screen-share states are tested in Chromium with fake-media flags. The voice flow is checked at the human gate with keys present.

**Acceptance Scenarios**:

1. **Given** sharing has never started, **When** the learner starts sharing and grants permission, **Then** the status shows active sharing and the time of the last frame.
2. **Given** sharing is active, **When** the learner stops sharing from the page or the browser bar, **Then** the status shows stopped.
3. **Given** the learner denies permission, **Then** the status shows denied with guidance on how to try again.

### Edge Cases

- The evaluation request fails: the review returns to "not yet reviewed" with a visible error and can be requested again.
- The evaluation outcome is unknown or uncertain: it is treated as guidance needed (fail closed).
- The case supplies decision choices: a choice list is shown. With no choices, a free-text field is shown.
- Region marking is optional; the marked region belongs to the practice trace's frame only.
- The voice keys are missing: the tutor panel shows disconnected with an error, and practice still works.
- Screen capture is unsupported by the browser: the status says it is unsupported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The review state is one of: draft changed / not yet reviewed, review pending, guidance needed, review complete, saving, saved, save failed.
- **FR-002**: Any edit after a review makes the draft not-yet-reviewed and increments the draft revision.
- **FR-003**: An evaluation whose draft revision or knowledge revision does not match the current state is ignored.
- **FR-004**: A knowledge revision change invalidates any review.
- **FR-005**: Save is possible only when the review is complete, or as a retry after a failed save of the same reviewed revision. A repeated save request while saving does nothing.
- **FR-006**: "Saved" is shown only after the save is acknowledged.
- **FR-007**: Mapping an evaluation outcome to a review state happens in exactly one adapter; screen code never judges correctness.
- **FR-008**: Each state is shown with an icon and text. When Save is disabled, the reason is shown.
- **FR-009**: Guidance shows the tutor message, the guiding question and citations. AI or fixture text is visually distinct from the expert's verbatim quote.
- **FR-010**: A timeline shows proposed → guidance → corrected → saved with times.
- **FR-011**: The fixture data source simulates evaluation and commit with configurable latency and failure. It returns guidance needed for the first submission of a draft and review complete afterwards. It is labelled as fixture behaviour and contains no correct answer.
- **FR-012**: The tutor voice panel shows agent status derived from the real session state, with microphone permission shown separately.
- **FR-013**: Screen sharing has permission, active, stopped, denied and unsupported states. Frames are delivered through the route verified in `notes/ws7-screen-observation.md`.
- **FR-014**: The UI never makes the agent speak; context is sent silently.
- **FR-015**: No evaluator-only fields reach the built client bundle or the fixtures.

### Key Entities

- **Learner draft**: decision, reason, optional region, draft revision.
- **Evaluation**: outcome (defined by WS5), message, guiding question, citations, and the revisions it applies to.
- **Review state**: the current status plus the draft and knowledge revisions it is keyed on.
- **Timeline entry**: kind, time, draft revision.
- **Screen frame reference**: frame id, capture time, draft revision.

## Success Criteria *(mandatory)*

- **SC-001**: In 100% of tested sequences, a save is never possible from a stale or unreviewed state (reducer table).
- **SC-002**: A double click on Save produces exactly 1 commit.
- **SC-003**: The end-to-end fixture flow completes with screenshots for each step.
- **SC-004**: The evaluator-only field name search over the built client and fixtures returns 0 hits.

## Assumptions

- WS5 outcomes are `ok`, `intervene` and `uncertain`. `uncertain` maps to guidance needed until WS5 confirms otherwise, which is stricter than WS6's default.
- The WS6 API is not yet implemented, so this sprint is fixture-backed. The real evaluation comes from WS5 through WS6 later.
- Server-side commit enforcement is WS6's; the UI guard is for usability only.
