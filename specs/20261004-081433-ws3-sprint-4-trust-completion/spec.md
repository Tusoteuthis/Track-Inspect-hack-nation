# Feature Specification: WS3 Sprint 4 — Off-record, session completion, demo evidence & WS5 handoff

**Feature Branch**: `worktree-ws03-sprint-4`
**Created**: 2026-10-04
**Status**: Draft
**Input**: Sprint prompt `notes/ws3-sprints/sprint-4-trust-completion.md` (wins on conflicts) plus orchestrator overrides (no merge of S2/S3 yet; no change to the shared agent's privacy settings; explicit, session-scoped ElevenLabs conversation deletion).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The expert goes off the record and it stays off (Priority: P1)

Mid-session the expert says "off the record", says something sensitive, then says "back on the record". The apprentice acknowledges briefly, asks nothing meanwhile and never refers to it later. Nothing said or pointed at in between appears in any saved file; the saved record only shows "off-record segment from T1 to T2 (content excluded)" and counts.

**Independent Test**: scripted session with a sentinel phrase spoken off record (including inside the utterance that requests it); every file written for the session is scanned for the sentinel.

**Acceptance Scenarios**:
1. **Given** an on-record session, **When** the expert says "off the record, pineapple calibration …", **Then** the state becomes off record (acknowledged), and the sentinel is in no saved file.
2. **Given** off record, **When** a pointing event arrives or the agent tries to ask a question, **Then** the event is not stored or released and the question is refused.
3. **Given** an open debrief gap, **When** the expert answers it off record, **Then** the gap stays open and no draft step uses that answer.
4. **Given** a capture event with `record_state: off_record`, **Then** the session goes off record (trigger: capture).
5. Toggling from the console behaves the same and the agent is told to acknowledge.

### User Story 2 — "Forget what I just said" (Priority: P1)

The expert asks to strike their last answer. Their words for the last answered exchange are removed from all saved paths; AI notes and draft steps derived from it are redacted; dependent revisions are superseded; any confirmation that relied on them is invalidated and the console and agent say so; a new teach-back/confirmation is required.

**Independent Test**: confirmed session, then strike → phase returns to teach-back, `confirmed_revision_id` null, struck words in no file.

### User Story 3 — Honest completion (Priority: P1)

On Stop, disconnect or error the session writes `completion.json` and `completion.md`: end reason, confirmed revision (only an explicit, still-valid confirmation of the latest revision), final coverage, unresolved questions and gaps, excluded counts, question counts derived from the stored records, and a plain list of what was not finished. An unfinished session never claims to be complete or confirmed. A dropped connection can be resumed best-effort under the same session id and phase.

### User Story 4 — Demo evidence (Priority: P2)

A per-session `demo-evidence.md` derived only from stored records: challenge checklist (✓/✗ with links), annotated transcript, timing table, live vs fixture. Console button "Export demo evidence" re-derives it from disk.

### User Story 5 — ElevenLabs side, honestly (Priority: P2)

For a session with off-record segments, the operator can delete that session's own ElevenLabs conversation(s) via an explicit console action (or automatically at session end when the checkbox is on); the result per conversation is shown and stored. The mic can be muted while off record. Account/agent retention settings are documented but not changed.

### User Story 6 — WS5/WS6/WS7 handoff (Priority: P2)

`voice-interface.md`, `trust.md` and the final contracts doc let WS5 reuse the voice component and consume only confirmed, on-record material.

### Edge Cases

- The off-record request and the sensitive words are in the same utterance (handled by excluding the triggering utterance retroactively).
- Speech marks stamped back into a closed off-record segment are dropped.
- Session ends while off record: segment closed at session end.
- Strike with nothing on record → refused with a clear message.
- Strike of the confirming answer itself → confirmation invalidated, re-ask.
- Deletion requested for a session still running, without off-record segments, or with an unknown id → refused; only ids stored in that session are ever deleted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** Record state changes (agent tool, console, expert phrase, capture event) each create a recording segment with trigger and time; the current acknowledged state is shown in the console.
- **FR-002** While off record, transcript lines (both roles), answer lines, preamble lines, timing marks, events and questions are dropped before any snapshot; agent tools that would record content are refused.
- **FR-003** The utterance that requested off-record (and later user lines) is excluded retroactively; the segment starts at that utterance.
- **FR-004** Off-record events are never stored, released, linked or used as evidence.
- **FR-005** Snapshot validation refuses any off-record record or any content timestamped inside an off-record segment (server-side guard).
- **FR-006** Persisted output keeps only segment times/triggers and excluded counts.
- **FR-007** Strike removes the last answered exchange's expert words and dependent transcript lines, redacts derived AI notes/steps/change reasons/teach-back text, reverts coverage/agenda/open-question links, supersedes dependent revisions, invalidates dependent confirmations and leaves `confirmed` phase.
- **FR-008** Completion record + Markdown on every end; `completed` only with a valid explicit confirmation of the latest revision; counts derived from records.
- **FR-009** Resume: same session id, phase before the end, new conversation id appended, a state-summary contextual update (no transcript).
- **FR-010** Demo evidence derived from stored records, written at session end and on demand.
- **FR-011** Server route deletes only the conversation ids stored in that ended session with ≥1 off-record segment; per-id result stored and shown.
- **FR-012** Agent prompt/tools: `set_record_state`, `strike_last_answer`; 3 new probes ≥4/5 and existing 16 still ≥4/5.
- **FR-013** Contract bumped to `ws3.v1` for session records; pointing events stay `ws3.v0`.

### Key Entities

- **RecordingSegment**: state, start/end, trigger.
- **Strike**: struck exchange, superseded revisions, invalidated confirmations.
- **SessionCompletion**: end reason, cause, confirmed revision, coverage, unresolved, unfinished statements, excluded counts, question counts.
- **ElevenLabs deletion report**: per conversation id: deleted / not_found / failed.

## Success Criteria *(mandatory)*

- **SC-001** A sentinel phrase spoken off record appears in 0 saved files of the session.
- **SC-002** 100% of sessions ended without a valid confirmation of the latest revision are labelled incomplete with ≥1 unfinished statement.
- **SC-003** All 6 checklist rows are ✓ for the scripted full session; rows flip to ✗ when their evidence is missing.
- **SC-004** New probe cases pass ≥4/5 runs; existing 16 stay ≥4/5.

## Assumptions

- Mic muting while off record is optional (console checkbox, default off) because a muted expert cannot say "back on the record"; with it off, audio reaches ElevenLabs and the session's conversation is deleted afterwards (default on when off-record occurred).
- Returning on record needs the expert (voice or console) unless the segment was started by a capture event, which a later on-record capture event may end.
- Strike targets the most recent exchange with expert words other than the strike request itself.
- Agent paraphrases spoken after a struck answer (other than teach-backs of superseded revisions) are not rewritten — documented limitation.
- Shared expert agent privacy settings stay untouched (orchestrator override).
