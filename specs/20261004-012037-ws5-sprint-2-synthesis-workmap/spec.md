# Spec: WS5 Sprint 2 — Synthesis, gaps, teach-back & Work Map content

Source prompt: `notes/ws5-sprints/sprint-2-synthesis-workmap.md` (it wins on conflicts).

## User stories
- **US1 (WS6/WS3):** turn a session's on-record events and exchanges into draft knowledge entries and an ordered workflow; every entry links a screen moment and verbatim expert words.
- **US2 (WS3 debrief):** get the genuine gaps (never padded), highest priority first; an answered gap disappears.
- **US3 (expert):** hear a process-level teach-back that covers every step and guardrail and ends with a confirmation question; the confirmation binds to the listed revisions.
- **US4 (expert correction):** a correction produces rev-(n+1) only for the touched entries, with parent and change_reason; entries sharing evidence are flagged for re-confirmation.
- **US5 (WS7 via WS6):** Work Map content per step: expert words, AI synthesis, guardrails, visuals, confirmation, broken links.

## Functional requirements
- FR-001 `synthesize` is pure and deterministic; excludes off-record exchanges/events before synthesis.
- FR-002 One entry per (event, role); many-to-many support; qualifiers preserved; hedge without exception → gap, not rule.
- FR-003 Content hash: unchanged → no revision; changed → rev-(n+1), parent, change_reason.
- FR-004 Workflow in logical order with entry_id@revision_id; timeline kept as metadata; `renderWorkflowMarkdown` with relative links.
- FR-005 `findGaps` with the six kinds; priorities; never padded.
- FR-006 `buildTeachBack` covers every step and guardrail; lists reviewed revisions.
- FR-007 WS3 and WS6 adapters type-check against their documented interfaces.
- FR-008 `buildWorkMap`; missing evidence → broken_links; eligible-only by default, `include_draft`.
- FR-009 Fixture scenario + dev script + drift test; handoff.

## Out of scope
Tutor evaluation, routes/jobs/locks, Work Map UI, the debrief conversation. No LLM pass (no provider key in web/.env).
