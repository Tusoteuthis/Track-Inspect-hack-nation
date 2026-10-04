# WS6 Sprint 3 — Newcomer session & pre-save enforcement: plan

Source prompt: `notes/ws6-sprints/sprint-3-newcomer-presave.md` (wins on conflicts).
Branch: `005-ws6-newcomer-presave`, stacked on `004-ws6-knowledge-confirmation` (S2 is not yet merged into
`worktree-ws06-backend`; human decision 2026-10-04). Merged in: `worktree-ws05-sprint-3` (real WS5 tutor
evaluator), `voice` (WS3 S1, WS7 S1/S2).

## Design decisions (D29–D45, mirrored in `notes/ws6-api-v0.md` §9)

- **D29 Cases.** `CASES_DIR` env; otherwise `<repo>/cases/learner` if it exists; otherwise the labelled
  fixture cases in `web/fixtures/ws6/cases` (`source: "fixture"`). `case.json` is a strict schema
  (`case_id, title, trace_asset, shown_to_expert, source, visible_context?, decision_options?`); any other key
  (and any WS5-forbidden evaluator key) makes the case unusable. The trace image is served only by
  `GET /api/cases/:id/trace`.
- **D30 Evaluator separation.** Every served-path resolver (`imagesRoot/assetDir`, `casesRoot/caseDir`) refuses
  a path inside `EVALUATOR_DIR`. Only `config.ts` and the guard in `paths.ts` mention the evaluator dir; a test
  greps routes and module adapters.
- **D31 Pinning.** WS5 `selectEligible` over the current revision of every entry, with WS6 status and
  confirmation injected (shared `ws5-content.ts`, also used by the Work Map). Non-WS5 (stub) revisions are
  never WS5-eligible; they are pinned only when confirmed + current **and** `allow_fixture_knowledge=1`.
  Revisions listed in their session's `flagged_for_reconfirmation` are excluded. Empty → `409
  no_confirmed_knowledge`. The session records `knowledge_fixture_allowed`.
- **D32 Re-pin.** `POST /api/sessions/:sid/pin` recomputes the pinned set (only while not committed); every
  existing evaluation becomes `stale` (`knowledge_changed`). Without it a session whose knowledge changed
  would be stuck.
- **D33 Learner draft.** `knowledge/learner/<sid>/draft.json` (current) + `drafts/<rev>.json` (history,
  immutable). Retry with the same base and identical body → `200` current draft. `visual_context[].asset_id`
  must be a stored asset of this session (`409 asset_not_available`).
- **D34 Evaluations.** `knowledge/learner/<sid>/evaluations/<eid>.json`. One live (pending/done) evaluation per
  `(session, draft_rev)`: a repeat returns it (`200`); a `failed` or `stale` one may be retried (`202` new).
  Completion re-checks draft rev + pinned currency under the session lock; changed → stored as `stale`
  with `stale_reason`, never `done`. Module throw → `failed` (`error_code: module_error`), no content.
- **D35 SSE types (keeps S0 D9).** `evaluation.updated {evaluation_id, draft_rev}` on every status change
  (pending, done, failed, stale), `draft.updated {draft_rev}`, `commit.stored {commit_id, evaluation_id,
  draft_rev}`, `assessment.stored`, `session.updated` (re-pin). The S3 prompt's `evaluation.done|stale` /
  `draft.committed` are not used; clients re-fetch the evaluation for its status.
- **D36 Commit guard (keeps S0 D10).** `canCommit` is pure (`commit-policy.ts`) and returns the prompt's six
  codes. They travel as `error.details.policy_code` under the stable S0 error codes: `evaluation_required`,
  `evaluation_pending`, `evaluation_stale` (policy `evaluation_stale` or `knowledge_changed`), `commit_blocked`
  (policy `blocked_by_outcome` or `already_committed`). All `409`.
- **D37 Escalation.** `allow_with_escalation` requires `escalated: true` in the commit request (the learner
  explicitly saves-and-escalates); otherwise `blocked_by_outcome` with `details.requires = "escalated"`.
  Unknown outcomes → `block` (fail closed). `failed` evaluations → `evaluation_required`.
- **D38 Commit record.** `commit.json` adds `escalated`, `outcome`, `knowledge_revision_ids`,
  `idempotency_key_sha256` (the key is hashed, never stored raw).
- **D39 Assessment.** Stub (`ws6-stub-assessment`, `source: "stub"`) on commit or newcomer `end`: facts only
  (initial decision, interventions, final outcome, cited entries, WS5 `buildTimeline`), `practice_next: null`
  + note "requires WS5". `assessments/<sid>.json` + `.md`. Written once per session.
- **D40 Tutor registry.** Stub by default; `WS5_MODULES=real` uses WS5 `createWs6TutorEvaluator`
  (Anthropic judge, needs `ANTHROPIC_API_KEY`). Stub decides only by test hook: decision
  `FIXTURE_WRONG → intervene`, `FIXTURE_UNCERTAIN → uncertain`, `FIXTURE_FAIL → throws`, else `ok`; citations
  are mechanical (first pinned revision, its exchanges, first verbatim answer line).
- **D41 Newcomer lifecycle.** Drafts/evaluations accepted in `created`/`active`; rejected when `ended`,
  `aborted` or committed (`invalid_transition`). Off-record newcomer sessions refuse drafts (`off_record`).

## Lanes (executed sequentially in this worktree)

A. contracts (case, create-session union, session fields, error codes) → cases + evaluator guard → pinning →
   newcomer creation + re-pin route.
B. learner draft PUT/GET → tutor provider (stub + WS5 adapter) → evaluation request/runner/stale → routes.
C. `commit-policy.ts` + `outcome-policy.json` → commit route → assessment → routes; health modules.

## Tests (vitest, temp dirs)

`commit-policy.test.ts` (exhaustive table), `cases.test.ts` (+ evaluator separation grep),
`newcomer.test.ts` (pinning, refusals, fixture flag), `learner.test.ts` (draft/eval/stale/commit matrix incl.
`Promise.all`, happy path, assessment), route tests for the new handlers.
