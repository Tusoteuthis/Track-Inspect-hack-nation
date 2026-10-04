# Feature Specification: WS3 Sprint 3 — Coverage, debrief, teach-back, revisioned confirmation

**Feature Directory**: `specs/20261004-003657-ws3-sprint-3-debrief-confirmation`
**Created**: 2026-10-04
**Status**: Draft
**Input**: `notes/ws3-sprints/sprint-3-debrief-confirmation.md` ("Scope" and "Acceptance criteria"). That prompt wins on any conflict.

## User Scenarios & Testing

### User Story 1 — Debrief only about what is still open (P1)

The expert finishes the task ("I'm done"). The apprentice then asks at least three follow-up questions, one at a time, about matters the live interview left open: regions that were pointed at but never discussed, and missing guardrails, alternatives or reasons. It never re-asks something already answered.

**Independent test**: Drive a fixture session through the live phase with some dimensions covered. Then end the task and check that every debrief question carries a gap id from the frozen agenda, that no agenda gap was covered before the debrief, and that deferred regions show up as gaps.

**Acceptance scenarios**
1. **Given** a live session where the guardrail for evt-001 was answered, **when** the debrief starts, **then** the agenda has no guardrail gap for evt-001.
2. **Given** a topic deferred to the debrief, **when** the debrief starts, **then** an open question and a gap for that region exist.
3. **Given** the expert says "I don't know, I'd escalate that", **when** the agent records it, **then** the gap is closed as unknown, the draft gets a guardrail step for it, and the agent does not push further.

### User Story 2 — Teach-back of a numbered revision (P1)

After the debrief, the apprentice proposes a workflow draft. The system turns it into an immutable revision `rev-n`, with every step linked to screen moments and to the expert's own words. The apprentice then explains the process as something a newcomer could apply, and asks explicitly whether it is right.

**Independent test**: Propose a draft with one step that has no evidence and one that quotes words the expert never said. The unsupported step is flagged and not taught. The invented quote is rejected.

### User Story 3 — Correction and explicit confirmation (P1)

The expert corrects one point. The correction creates `rev-(n+1)` with a parent and a change reason that references the correction exchange. Only the changed steps are re-taught. The final confirmation names the latest revision and the exchange that holds the expert's words. Silence, a change of subject, or a stale revision id never confirm anything. A session that ends without confirmation is `incomplete`.

### User Story 4 — Console visibility (P2)

The developer sees on the console:
- the phase
- an event × dimension coverage grid
- the agenda with done/remaining
- the revisions with a diff to their parent
- the confirmation status
- separate live and debrief counters

### Edge cases
- `record_coverage` for an unknown exchange, for a clarify_reference exchange, or before any answer: rejected.
- A coverage downgrade request: ignored, and the status stays.
- `confirm_revision` with no expert words since the teach-back: rejected.
- `confirm_revision` with a stale `revision_id`: rejected.
- `propose_draft` with unknown evidence ids or non-verbatim quotes: rejected with every error listed.
- New pointing events after the live phase: stored, never released.
- A second `signal_task_complete`: rejected.

## Requirements

### Functional requirements
- **FR-001**: Coverage per on-record topic and one session row, over the dimensions decision, reason, cues, alternatives, guardrails and unresolved. Statuses: missing < partial < covered. Monotonic. The note is AI synthesis and is stored apart from verbatim lines.
- **FR-002**: A deterministic gap selector builds the agenda. It excludes covered items and dimensions already asked directly on that region. It puts deferred topics first, then guardrails, alternatives and missing reasons. The agenda is frozen at debrief start (max 5).
- **FR-003**: Phases are live → debrief → teach_back → confirmed | incomplete. The debrief starts from the agent tool `signal_task_complete` or a console button. The agent learns of it through the tool result and a `[PHASE debrief]` contextual update.
- **FR-004**: Debrief questions require a `gap_id` on the agenda. Live counters ignore debrief exchanges, and the reverse.
- **FR-005**: `buildDraft` creates immutable `rev-n` revisions:
  - each step lists event and exchange evidence;
  - a step without both is flagged unsupported, becomes an open question and is not taught;
  - quotes must appear verbatim in a linked answer line.
- **FR-006**: The teach-back is delivered from the current revision (`[TEACH_BACK rev-n]`) and ends with an explicit confirmation question.
- **FR-007**: `confirm_revision` does three things:
  - it rejects stale ids and confirmations without an explicit response;
  - it links the response exchange;
  - a correction leads to `rev-(n+1)` with a parent and a change reason that references the correction exchange.
- **FR-008**: The system persists `revisions/rev-n.json|md` (never overwritten with different content), `confirmations.json` and `knowledge-draft.md`, and updates `exchanges.md` and `session.json`.
- **FR-009**: The coverage tracker and draft builder sit behind a `synthesis` interface that WS5 can replace while keeping the evidence ids.
- **FR-010**: There are 5 new probes, plus the 10 existing ones. Each passes in at least 4 of 5 runs.

### Key entities
CoverageItem, Gap/DebriefItem, OpenQuestion, DraftRevision/DraftStep, ExpertConfirmation, PhaseChange (see data-model.md).

## Success Criteria
- **SC-001**: In an end-to-end fixture session:
  - at least 3 debrief exchanges, each tied to a gap that was missing before the debrief;
  - at least 2 revisions after one correction;
  - the final confirmation references the latest revision.
- **SC-002**: Every step and guardrail in `knowledge-draft.md` links to an image and to verbatim expert words. Zero non-verbatim quotes.
- **SC-003**: All new probes pass in at least 4 of 5 runs, with no regression in the 10 Sprint 1–2 probes.

## Assumptions
- The draft text is composed by the voice agent through a `propose_draft` tool. No server LLM key is available, and Option A is preferred. A deterministic fallback draft exists for the console button and for tests.
- One ElevenLabs session covers all phases (capabilities doc, mechanism d).
- Based on the Sprint 2 branch, because Sprint 2 is not yet merged into `voice` (approved by the human).
