# Spec: WS7 Sprint 4 — Learning summary, trust controls, real API, demo readiness

**Source prompt:** `notes/ws7-sprints/sprint-4-summary-integration.md` (wins on conflicts) · **Branch:** `ws7-sprint-4` (from `ws7-sprint-3`, which is not yet merged into `voice`) · **Date:** 2026-10-04

## Context found at start
- S1–S3 are on their branches; S1/S2 are merged into `voice`, S3 (`ws7-sprint-3`) is not. S4 therefore branches from `ws7-sprint-3`.
- WS6 S0–S2 exist only on `004-ws6-knowledge-confirmation` (not on `voice`): sessions, lifecycle, record-state, events, SSE stream, knowledge entries/revisions, confirmations, Work Map. WS6 S3 (cases, learner draft, evaluations, commit, assessment) and S4 (revoke, delete, diagnostics) do not exist yet.
- **Human decision (2026-10-04):** build `apiSource` against the WS6 api-v0 contract with mocked-fetch tests and per-screen config defaulting to fixture; do **not** merge WS6. Every screen stays fixture-labelled until WS6 is on `voice`.

## User stories
- **US1 (P1) Learning summary.** A reviewer opens `/summary` and sees four clearly separated groups — done independently, needed help (intervention + cited expert entry/revision), unresolved, what to practise next — with each citation deep-linking to `/map?entry=…&rev=…`. No overall score unless WS5 supplies one. An assisted item never appears under "done independently".
- **US2 (P1) Trust controls.** On `/map` item detail and on `/review`, the expert can request a correction, remove an item from teaching (revoke) and delete a piece of evidence. Each shows pending → acknowledged / failed; nothing is shown as done before the ack. Revoked items disappear from `/practice` citations; where history is shown (`/map`, `/review`) they stay visible, marked "Revoked", with no teaching content.
- **US3 (P1) Consistent states.** One shared `ConnectionStatus` component on every data screen; every route has loading, empty and error states; no status by colour alone; keyboard/focus pass.
- **US4 (P2) Real API.** `apiSource` implements `DataSource` against WS6; the source is chosen per screen via env config, so a partial backend works; the FIXTURE banner disappears only on screens whose data is really live. Contract mismatches are fixed in the mapping layer and listed in the handoff.
- **US5 (P2) Demo readiness.** Demo navigation guide, README section, Playwright journey entry → expert → review → Work Map → practice (wrong → guidance → corrected → saved) → summary with screenshots at the demo resolution.

## Functional requirements
- FR-001 Summary groups come from the source's `AssessmentView`; the WS5 → view mapper places `correct_after_help` in "needed help" and `unresolved_or_escalated` / unknown classes in "unresolved". Display guard: an item with interventions is never rendered under "done independently".
- FR-002 Summary shows WS5 `limitations` when supplied and an honest note that one coached correction is not mastery.
- FR-003 `DataSource.revokeEntry(entry_id, revision_id)` and `DataSource.deleteEvidence(session_id, event_id)` return `Ack`; the UI keeps them pending until the Ack.
- FR-004 New `SourceUpdate` `{type:"knowledge", entry_id, revision_id, status}` (WS6 `entry.revoked`). `/practice` drops citations of revoked entries and invalidates a review that cited one.
- FR-005 Fixture revocations/deletions are shared by every fixture source instance in the tab (module-level store), so a revoke on `/map` is visible on `/practice`.
- FR-006 `ConnectionStatus` renders reconnecting/disconnected with icon + text (`role=status`), nothing when connected/unknown; used on `/expert`, `/review`, `/map`, `/practice`, `/summary`.
- FR-007 Every route's screen renders `role=alert` when the source rejects (component tests).
- FR-008 `apiSource` maps WS6 records → UI types: lifecycle (`created→not_started`, `aborted→ended`), record state, evidence frame identity (region belongs to the asset's original frame), `source: stub` shown as non-live, error envelope → `Ack.failed(message)`.
- FR-009 Per-screen config `NEXT_PUBLIC_WS7_LIVE_SCREENS` (comma list of `expert,review,map,practice,summary`), base URL `NEXT_PUBLIC_WS6_BASE_URL` (default same origin). Default: all fixture.
- FR-010 Evaluator-field grep over `.next/static` after build has zero hits.

## Out of scope
Merging WS6/WS5/WS3; WS6 endpoints that don't exist (pause, cases, review view, review marks, revoke/delete are contract-only); off-record forwarding to the agent (WS3).
