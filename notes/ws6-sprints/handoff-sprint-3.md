# WS6 Sprint 3 handoff — Newcomer session & pre-save enforcement

**Branch:** `005-ws6-newcomer-presave`. It is **stacked on `004-ws6-knowledge-confirmation`** (S2), because S2 was not yet merged into `worktree-ws06-backend` (human decision, 2026-10-04). Also merged in: `worktree-ws05-sprint-3` (the real WS5 tutor evaluator; human decision) and `voice` (WS3 S1, WS7 S1/S2; one `.gitignore` conflict resolved by keeping both blocks).
**Spec/plan:** `specs/005-ws6-newcomer-presave/plan.md`
**Date:** 2026-10-04

**Modules used:**
- synthesis: real WS5 (`ws5-synthesis@0.2.0`), as in S2;
- tutor: **stub by default** (`ws6-stub-tutor@0.1.0`). `WS5_MODULES=real` switches to WS5's `ws5-tutor@0.3.0` (Anthropic judge);
- assessment: stub (`ws6-stub-assessment@0.1.0`). WS5 has no assessment module yet.

## Delivered

**Contracts** (`web/lib/contracts/`)
- `learner.ts`:
  - `CaseFile` (strict), `LearnerCase` and `PutLearnerDraftRequest`;
  - `Citation` and `EvaluationRequest`;
  - `CommitRequest`, plus optional fields on `Commit`: `outcome`, `escalated`, `knowledge_revision_ids` and `idempotency_key_sha256`;
  - optional fields on `Evaluation`: `completed_at_utc`, `stale_reason`, `error_code`, `uncertainty`, `evidence` and `guard_notes`.
- `session.ts`: `CreateSessionRequest` is now a discriminated union (expert | newcomer `{ case_id?, source? }`), and `Session.knowledge_fixture_allowed?` is new.
- `errors.ts`: `no_confirmed_knowledge` and `case_not_permitted` (409).
- `assessment.ts`: `practice_next` is now nullable, and `produced_by?` is new.
- `knowledge.ts`: `StatusTransition.reason?`, prepared for S4 revocation.
- `expert.ts`: accepts WS3 S1's new `question_planned` field (defaults to `null`). This was needed after merging `voice`.

**Backend** (`web/lib/backend/`)
- `cases.ts`: learner case loading, the trace response and newcomer case choice.
- `paths.ts`: `servable()` guard. `imagesRoot`, `casesRoot` and `caseDir` refuse `EVALUATOR_DIR`.
- `config.ts`: `casesDir` (`CASES_DIR` → `<repo>/cases/learner` → `web/fixtures/ws6/cases`).
- `ws5-content.ts`: WS5 content with WS6 status, confirmation and revocation injected. It is shared by the Work Map, pinning and the tutor.
- `newcomer.ts`: `selectPinnedKnowledge` (WS5 `selectEligible`), `pinnedKnowledgeCurrent`, `createNewcomerSession` and `repinSessionLocked`.
- `modules.ts`: `TutorEvaluator`, `TutorHost` and `TutorProvider`, the WS5 adapter (`createWs5TutorProvider(judge?)`), the registry and `STUB_ASSESSMENT`. `activeModules()` now reports `{ synthesis, tutor, assessment }`.
- `tutor-stub.ts`: a test-hook-only stub. It cites mechanically and never judges.
- `learner-store.ts` and `learner.ts`:
  - draft PUT/GET;
  - evaluation request, runner and finish under the lock, with stale handling;
  - re-pin;
  - commit and `onNewcomerEnded`.
- `commit-policy.ts` + `outcome-policy.json`: the pure `canCommit` and the policy table (**pending WS5 agreement**).
- `assessment.ts`: the stub assessment (JSON + Markdown, WS5 `buildTimeline`).
- Test helpers: `learner-test-helpers.ts`.

**Routes** (`web/app/api/`)
- `cases/[case_id]` (GET) and `cases/[case_id]/trace` (GET)
- `sessions` (POST): newcomer branch, `?allow_fixture_knowledge=1`
- `sessions/[sid]/draft`: GET dispatches by role; PUT is new
- `sessions/[sid]/evaluations` (POST, GET) and `…/[evaluation_id]` (GET)
- `sessions/[sid]/commit` (POST, GET), `sessions/[sid]/assessment` (GET), `sessions/[sid]/pin` (POST)
- `sessions/[sid]/lifecycle`: newcomer `end` writes the assessment

**Fixtures:** `web/fixtures/ws6/cases/{fx-n01,fx-n02,fx-e01}`, labelled `fixture`. `fx-e01` was shown to the expert.

**Docs:**
- `notes/ws6-api-v0.md`: §2 SSE rows, §3 layout, §5.8 (all S3 routes), new §5.13, rewritten §6 commit rule, and D29–D41.
- `specs/005-…/plan.md`.

## Verification evidence

In `web/` at `8f65f7f` plus the doc/handoff commit:

```
$ npm run typecheck
> tsc --noEmit
(exit 0)

$ npx vitest run
 Test Files  89 passed (89)
      Tests  1141 passed (1141)
```

There were 1072 tests after the `voice`/WS5-S3 merges and before any S3 code, so 69 are new. The S3 test files are:

| File | Tests |
|---|---|
| `lib/backend/commit-policy.test.ts` | 22 (exhaustive `canCommit` table + policy file) |
| `lib/backend/learner.test.ts` | 23 |
| `lib/backend/newcomer.test.ts` | 9 |
| `lib/backend/cases.test.ts` | 8 (incl. evaluator separation) |
| `app/api/sessions/newcomer.routes.test.ts` | 4 |
| `app/api/health/route.test.ts` | 4 (one new) |
| `lib/contracts/requests.test.ts` | updated for the newcomer union |

**Acceptance criteria → tests** (`learner.test.ts` unless noted)

| Criterion | Test |
|---|---|
| Commit rejected without an evaluation | "rejects without an evaluation" (`evaluation_required`, also for an unknown `evaluation_id`) |
| …while the evaluation is pending | "rejects while the evaluation is pending" (a gated tutor; the commit succeeds after release) |
| …after an edit after evaluation (stale) | "rejects after an edit (stale) and for an older draft_rev" |
| …for an evaluation of an older draft_rev | same test (`draft_rev` 1 vs 2 in both directions) |
| …for outcome `intervene` | "rejects outcome intervene" (`commit_blocked` / `blocked_by_outcome`) |
| …when pinned knowledge is revised or revoked after evaluation | "rejects when pinned knowledge is revoked after evaluation" and "…is revised after evaluation; re-pin + re-evaluate recovers" (`evaluation_stale` / `knowledge_changed`) |
| …for a second commit with a different key | "a second commit: same key → the same commit (200); different key → already_committed" |
| Two concurrent commits → exactly one | "two concurrent commits with different keys → exactly one commit" (`Promise.allSettled`) and "…with the same key (double submit)" (`Promise.all`) |
| Happy path: wrong → intervene → edit → re-evaluate → ok → commit once → assessment | "wrong draft → intervene (citing the expert's words) → … → assessment" (+ the HTTP version in `newcomer.routes.test.ts`) |
| Newcomer session refuses a case shown to the expert | `cases.test.ts` "refuses a case shown to the expert"; `newcomer.test.ts`; route test (`409 case_not_permitted`) |
| No route can read `EVALUATOR_DIR` | `cases.test.ts` "every served-path resolver refuses EVALUATOR_DIR" and "no route handler or module adapter reads EVALUATOR_DIR" |
| Evaluation stored `stale`, never `done`, if draft/knowledge changed meanwhile | "an edit while the evaluation runs…" and "knowledge revoked while the evaluation runs…" |
| One pending evaluation per session/draft_rev | "binds to the exact draft and pinned knowledge; one per draft_rev" |
| Fixture knowledge only with `?allow_fixture_knowledge=1` | `newcomer.test.ts` "fixture knowledge is never used silently…"; route test |
| Real WS5 evaluator wiring | "the real WS5 evaluator runs through the adapter (scripted judge)…" and "…without a working judge → failed, never uncertain" |

### Live run (`npm run dev -- -p 3006`, real WS5 synthesis, stub tutor, separate dirs `web/.runtime/s3-demo/`)

```
$ curl -s localhost:3006/api/health | jq -c
{"ok":true,"schema_version":"ws6.v0","knowledge_dir_writable":true,"runtime_dir_writable":true,"modules":{"synthesis":{"id":"ws5-synthesis","version":"0.2.0","source":"live"},"tutor":{"id":"ws6-stub-tutor","version":"0.1.0","source":"stub"},"assessment":{"id":"ws6-stub-assessment","version":"0.1.0","source":"stub"}}}
$ npm run replay-capture → OK  session ses-20261004074721-7o751p
## expert: synthesize + teach-back + confirm
{"status":"done","revision_ids":["rev-20261004074729-jqkyhd"]}
PUT teach-back exchange → 201
[{"reviewed_revision_id":"rev-20261004074729-jqkyhd","result":"confirmed"}]
## newcomer
POST /api/sessions {"role":"newcomer"}  → {"code":"no_confirmed_knowledge",…,"details":{"excluded":[{"entry_id":"ent-evt-001-step","revision_id":"rev-20261004074729-jqkyhd","reason":"fixture_not_allowed"}]}}
POST …?allow_fixture_knowledge=1 {"case_id":"fx-e01"} → {"code":"case_not_permitted",…,"details":{"case_id":"fx-e01","reason":"shown_to_expert"}}
POST …?allow_fixture_knowledge=1 → {"session_id":"ses-20261004074732-y89e3m","role":"newcomer","case_id":"fx-n01","trace_ref":"/api/cases/fx-n01/trace","pinned_knowledge":[{"entry_id":"ent-evt-001-step","revision_id":"rev-20261004074729-jqkyhd"}],"knowledge_fixture_allowed":true,…}
GET /api/cases/fx-n01 → {"case_id":"fx-n01","title":"FIXTURE unseen newcomer case 1","shown_to_expert":false,"source":"fixture","visible_context":[…],"decision_options":null,"trace":{"url":"/api/cases/fx-n01/trace","mime":"image/png","width_px":320,"height_px":180}}
GET case trace → 200 image/png
## wrong draft → evaluate
PUT draft {"base_draft_rev":0,"decision":"FIXTURE_WRONG",…} → {"draft_rev":1,"decision":"FIXTURE_WRONG"}
POST evaluations {"draft_rev":1} → {"evaluation_id":"evl-20261004074733-062yf5","draft_rev":1,"knowledge_revision_ids":["rev-20261004074729-jqkyhd"],"status":"pending",…,"produced_by":{"module":"ws6-stub-tutor","version":"0.1.0","source":"stub"}}
GET evaluation → {"status":"done","outcome":"intervene","cited":[{"entry_id":"ent-evt-001-step","revision_id":"rev-20261004074729-jqkyhd","exchange_ids":["fx-exchange-001"],"quote":"FIXTURE expert answer line 1"}],"feedback_text":"STUB TUTOR — not a judgement (ws6-stub-tutor 0.1.0). Outcome \"intervene\" comes from a test hook.\nThe expert said (fx-exchange-001): \"FIXTURE expert answer line 1\""}
## commit now, and twice quickly
commit → {"code":"commit_blocked","message":"The tutor's outcome does not permit saving this draft.","details":{"policy_code":"blocked_by_outcome","outcome":"intervene","consequence":"block","evaluation_id":"evl-20261004074733-062yf5"}}
commit without evaluation_id → {"code":"evaluation_required",…,"details":{"policy_code":"evaluation_required","reason":"no_evaluation"}}
2 parallel commits (keys click-a, click-b) → "commit_blocked" "commit_blocked"
## edit → evaluate → commit
PUT draft base 1 → {"draft_rev":2,"decision":"FIXTURE corrected decision"}
GET old evaluation → {"evaluation_id":"evl-20261004074733-062yf5","status":"stale","stale_reason":"draft_changed"}
POST evaluations {"draft_rev":2} → … {"evaluation_id":"evl-20261004074735-2fuzqg","status":"done","outcome":"ok"}
2 parallel commits (keys save-a, save-b):
  {"commit_id":"cmt-20261004074737-i5f97c",…,"draft_rev":2,"evaluation_id":"evl-20261004074735-2fuzqg","outcome":"ok","escalated":false,"knowledge_revision_ids":["rev-20261004074729-jqkyhd"],"idempotency_key_sha256":"d4f3…98f9"} 201
  {"error":{"code":"commit_blocked","message":"This session's decision is already saved.","details":{"policy_code":"already_committed"}}} 409
replay key save-a → same commit 200
ls knowledge/learner/<sid>/ → commit.json draft.json drafts evaluations
GET assessment → {"initial_decision":"FIXTURE_WRONG","assistance":["intervene on draft_rev 1 (evl-20261004074733-062yf5)"],"final_outcome":"ok","evidence_used":[{"entry_id":"ent-evt-001-step","revision_id":"rev-20261004074729-jqkyhd"}],"practice_next":null,"produced_by":{"module":"ws6-stub-assessment","version":"0.1.0","source":"stub"},"interventions":1,"timeline":["proposed","evaluated","guidance_delivered","revised","evaluated","committed"]}
## SSE replay (?after=0) on the newcomer stream
draft.updated evaluation.updated evaluation.updated evaluation.updated draft.updated evaluation.updated evaluation.updated commit.stored assessment.stored
```

- **Diag hygiene:** 82 diag lines. The keys are only `at_utc, component, duration_ms, error_code, ids, op, outcome`, and 0 lines contain "FIXTURE".
- **Defect found and fixed during the live run:** marking an evaluation `stale` moved its `updated_at_utc`, so the assessment timeline showed "revised" before the first "evaluated". `completed_at_utc` now records when the tutor finished, and the timeline uses it. The happy-path test now asserts the exact order.
- The dev server was stopped. The live data is in the gitignored `web/.runtime/s3-demo/`.

## API/contract changes

All of these are in `notes/ws6-api-v0.md` §5.8, §5.13, §6 and D29–D41.

- **New routes:** 11 handlers (listed under "Delivered").
- **`POST /api/sessions`:** now accepts `role: "newcomer"`.
- **Error codes:**
  - New: `no_confirmed_knowledge` and `case_not_permitted` (409).
  - Commit refusals use the S0 codes with `details.policy_code`: `evaluation_required`, `evaluation_pending`, `evaluation_stale` (policy `evaluation_stale` | `knowledge_changed`), `commit_blocked` (policy `blocked_by_outcome` | `already_committed`).
- **SSE:**
  - `evaluation.updated { evaluation_id, draft_rev }` on create and on every status change.
  - `draft.updated { draft_rev }`.
  - `commit.stored { commit_id, evaluation_id, draft_rev }`.
  - `assessment.stored`.
  - `session.updated` on re-pin.
- **`/api/health.modules`:** gains `tutor` and `assessment`.
- **New data:** `knowledge/learner/<sid>/drafts/<rev>.json` and `knowledge/assessments/<sid>.{json,md}`. Both are gitignored.

## Decisions made (and why), especially deviations from the prompt

1. **The branch is stacked on S2, and WS5 S3 is merged in** (your decisions). Merging this branch also delivers S2 and WS5 Sprint 3.
2. **SSE and error names follow the published v0 decisions D9/D10, not the S3 prompt.**
   - The SSE names are `evaluation.updated` / `commit.stored` instead of `evaluation.done|stale` / `draft.committed`.
   - The six `canCommit` codes are returned exactly as the prompt specifies, but they travel in `details.policy_code` under the stable S0 error codes.
   - WS7 can explain every refusal from `policy_code`. Please confirm at the gate. Switching back is a 10-line change in `learner.ts`.
3. **`allow_with_escalation` requires `escalated: true`** in the commit request (D37). An `uncertain` outcome therefore never saves silently, and unknown outcomes block (fail closed).
4. **Re-pin route `POST /api/sessions/:sid/pin` (D32)**, not in the prompt. Without it, a newcomer whose pinned knowledge changes can never commit. Sprint 4's revocation cascade can call it automatically.
5. **Stub-synthesis revisions count as fixture material** (D31). They are pinned only with `?allow_fixture_knowledge=1`, because they are not WS5 knowledge.
6. **The tutor stub is the default** (D40). The real WS5 evaluator needs `ANTHROPIC_API_KEY`, which is still missing (WS5 handoff). `WS5_MODULES=real` turns on both real modules.
7. **`practice_next` is now `null`, not `[]`**, as the prompt asked. The schema was made nullable, and the existing fixture (an array) still parses.
8. **WS3 `question_planned`.** After merging `voice`, WS3's type requires it. WS6 accepts it and defaults it to `null` for older producers.
   - One line was fixed in WS5's `gaps.test.ts` (a missing `question_planned: null` in a fixture builder) so typecheck passes. See the requests below.
9. **Spec-kit was a manual pass**, as in S2: only `plan.md` with the decisions, and lanes run sequentially in this worktree (they share the learner store and the lock order).

## Stubs still in place

- **Tutor:** `ws6-stub-tutor@0.1.0` by default. `WS5_MODULES=real` uses `createWs6TutorEvaluator` (already wired and tested with a scripted judge). Every stub evaluation says `STUB TUTOR — not a judgement` and `produced_by.source: "stub"`.
- **Assessment:** `ws6-stub-assessment@0.1.0`, facts only. To swap in a WS5 module, replace the body of `storeAssessmentLocked` in `assessment.ts` with a call to it. The inputs (drafts, evaluations, commit, timeline) are already gathered there.
- **Cases:** labelled fixture cases until WS4 provides `<repo>/cases/learner/` (picked up automatically when the directory exists).

## Known limitations / open issues

- **Outcome policy table is pending WS5 agreement.** `ok → allow`, `intervene → block`, `uncertain → allow_with_escalation` with an explicit `escalated: true`. Still open: how "right decision, wrong reason" maps (WS5 currently returns `intervene` for it, which blocks).
- **Revocation/correction does not yet mark evaluations stale or re-pin automatically.** The commit guard already blocks (`knowledge_changed`), and `POST …/pin` recovers. The automatic cascade is S4.
- **Evaluations run in-process;** a restart leaves `pending`. That evaluation becomes `failed (interrupted)` on the next request for the same draft.
- **The real WS5 tutor was not run against Claude live** (no `ANTHROPIC_API_KEY` in `web/.env`). The adapter is tested with a scripted judge.
- **The live run used `allow_fixture_knowledge=1`,** because the only captured knowledge is the replay fixture. A real demo needs live expert knowledge for a strict session.

## Requests to partner workstreams

- **WS5**
  1. Confirm the outcome policy table and D37 (escalation needs explicit learner consent).
  2. `gaps.test.ts` needed `question_planned: null` after WS3 S1. WS6 changed one line on its branch; please make the same change on yours to avoid a conflict.
  3. Provide an assessment module, `buildAssessment(drafts, evaluations, commit, timeline)` or similar, so WS6 can drop the stub. `practice_next` is waiting for it.
  4. Your adapter's `Ws6LearnerCase.visible_context` is filled from `case.json.visible_context`.
- **WS4**
  - Deliver learner cases as `cases/learner/<case_id>/{case.json, <trace>.png}` with `shown_to_expert`, `visible_context` and `source`. Use lowercase IDs (`n01`, not `N01`).
  - Evaluator material goes into `EVALUATOR_DIR` only. A `case.json` with extra keys is rejected.
- **WS7**
  - `submitDraftForReview` = `PUT …/draft` then `POST …/evaluations`. Then wait for `evaluation.updated` and `GET …/evaluations/:id`.
  - `commitDraft` = `POST …/commit` with `evaluation_id` and a stable `idempotency_key`. Map refusals by `error.details.policy_code`. On `uncertain`, offer "save and escalate" (`escalated: true`).
  - The case trace is at `LearnerCase.trace.url`. `visual_context` frames must be uploaded as assets of the newcomer session first.
- **WS3**
  - Start the newcomer session (`lifecycle start`) before requesting a tutor token: `GET /api/conversation-token?flow=tutor&session_id=<sid>`.
  - Speak `feedback_text` from the evaluation.

## Human gate checklist (~20 min)

Set `WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`.

1. **Start fresh.** In terminal 1:
   ```
   cd "$WT/web" && npm run typecheck && npx vitest run
   KNOWLEDGE_DIR=.runtime/gate3/knowledge RUNTIME_DIR=.runtime/gate3/runtime npm run dev -- -p 3006
   ```
2. **Get confirmed knowledge.** In terminal 2:
   ```
   cd "$WT/web" && npm run replay-capture
   ```
   Note `S`. Then synthesize, PUT the teach-back exchange and confirm: steps 1 and 4 of the S2 gate, or the first block of the live run above.
3. **Newcomer and wrong draft.**
   ```
   NS=$(curl -s -X POST -H 'content-type: application/json' "localhost:3006/api/sessions?allow_fixture_knowledge=1" -d '{"role":"newcomer"}' | jq -r .session_id)
   curl -s -X PUT -H 'content-type: application/json' localhost:3006/api/sessions/$NS/draft -d '{"base_draft_rev":0,"decision":"FIXTURE_WRONG","reason":"r"}'
   E1=$(curl -s -X POST -H 'content-type: application/json' localhost:3006/api/sessions/$NS/evaluations -d '{"draft_rev":1}' | jq -r .evaluation_id); sleep 1
   curl -s localhost:3006/api/sessions/$NS/evaluations/$E1 | jq
   ```
   **Check:** `outcome: "intervene"`, `cited[0].revision_id` is the confirmed revision, and `quote` is the expert's line.
4. **Try to commit.** Commit with `E1`, then fire two commits in parallel; see the "commit now, and twice quickly" commands in the live run.
   **Check:** both are refused with `commit_blocked` / `policy_code: blocked_by_outcome`.
5. **Edit, re-evaluate, commit.** PUT with `base_draft_rev: 1`, evaluate `draft_rev: 2`, then commit with `idempotency_key: save-a`.
   **Check:** exactly one `knowledge/learner/$NS/commit.json`. A second key gives `already_committed`; the same key gives `200`.
   ```
   curl -s localhost:3006/api/sessions/$NS/assessment | jq
   ```
   **Check:** `interventions: 1` and the `caught_before_save` timeline.
6. **Fixture rule.** Without `?allow_fixture_knowledge=1` the newcomer POST is `409 no_confirmed_knowledge`. With `"case_id":"fx-e01"` it is `409 case_not_permitted`.
7. **Decide:**
   - D9/D10 naming (decision 2 above);
   - the escalation rule (decision 3);
   - the re-pin route (decision 4).
8. **Confirm the outcome policy table with the WS5 owner.**
9. **If satisfied, merge.** Merge S2 first if not already done (same command for `004-…`), then:
   ```
   cd "$WT" && git checkout worktree-ws06-backend && git merge --no-ff 005-ws6-newcomer-presave
   ```

## Notes for the next sprint (S4)

- **Revocation:** `appendStatusTransition` now takes `reason`, and `ws5Content` injects `revoked_at_utc`/`revoked_reason` from the log (`revocationOf`). The revoke route should append `to: "revoked"` with a reason, then for every newcomer session pinning it call `markEvaluationsStale(sid, "knowledge_changed")`, emit `entry.revoked`, and optionally `repinSession`.
- **Generation tokens:** `finishEvaluation` already re-checks draft and pins under the session lock. Add `generation` to that check.
- **Session deletion:** the evaluation runner's `done` promise never rejects (it logs `evaluations.finish` with `error_code: internal`), so deleting a session mid-evaluation is safe.
- **Assessment content:** the markdown contains the learner's decision text, so the deletion cascade must remove `knowledge/assessments/<sid>.*`.
