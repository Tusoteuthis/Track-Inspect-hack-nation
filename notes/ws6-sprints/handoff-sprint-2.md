# WS6 Sprint 2 handoff — Knowledge revisions & confirmation

**Branch:** `004-ws6-knowledge-confirmation`, based on `worktree-ws06-backend` at `8b519ca`. `voice` was already merged in, and `worktree-ws05-sprint-2` was merged in at the human's request (see D28).
**Spec:** `specs/004-ws6-knowledge-confirmation/`
**Date:** 2026-10-04

**WS5 module used:** the **real** WS5 module, `ws5-synthesis@0.2.0` via `createWs6SynthesisModule`. It is the default. `WS5_MODULES=stub` switches to `ws6-stub-synthesis@0.1.0`. Both were tested and both were run live.

## Delivered

**Contracts** (`web/lib/contracts/`)
- `synthesis.ts`: `Job`, `JobInputRevs`, `ModuleInfo`, `Gap`, `GapsView`, `SessionDraftView`, `ConfirmationRequest` (WS6 form), `ConfirmationPost` (WS6 form or a WS3 `ExpertConfirmation`), `ConfirmationResponse`.
- `workmap.ts`: `WorkMapView`, its steps, evidence and exchanges. `content` is typed as WS5's `WorkMapStep`.
- `knowledge.ts` changes:
  - `KnowledgeRevision` gains optional `session_id`, `content_sha256` and `change_reason`.
  - `Confirmation` gains optional `session_id` and `entry_id`.
  - New `StatusTransition`.
- Tests: `synthesis.test.ts`.

**Backend** (`web/lib/backend/`)
- `modules.ts`: the `SynthesisModule` / `SynthesisHost` / `SynthesisProvider` interfaces, the WS5 adapter wiring, the registry (`WS5_MODULES`) and `activeModules()`.
- `synthesis-stub.ts`: the stub. Every output is headed "STUB SYNTHESIS — not expert knowledge", carries `source: "stub"`, and contains only screen moments and exchange IDs with verbatim answer lines.
- `knowledge.ts`: the revision store.
  - Revision file format (D16).
  - Plan/commit with dedupe and numbering checks (D19).
  - Status log (D17).
  - Entry and revision reads and views.
  - `workflow.md` linkage (D21).
  - Relative-link checking.
  - `withKnowledgeLock`.
- `jobs.ts`: job records in `RUNTIME_DIR/jobs/`.
- `synthesis.ts`:
  - `requestSynthesis`, with one active job per session and recovery of jobs interrupted by a restart.
  - The job runner: snapshot → module → output checks → re-check under session lock → knowledge lock → persist.
  - Writes `gaps.json` and `draft.json`, and emits the SSE events.
- `confirmations.ts`: `postConfirmation` (all checks under the knowledge lock; crash-safe idempotency), `listConfirmations` and `toExpertConfirmation`.
- `workmap.ts`: `getWorkMap`. It resolves every link server-side, merges WS5's `buildWorkMap` content and filters with WS5's `isTeachable`.
- `health.ts`: now reports `modules.synthesis`.
- `ids.ts`: new `job` prefix.
- Test helpers: `synthesis-test-helpers.ts`.

**Routes** (`web/app/api/`)
- `sessions/[sid]/synthesis` (POST)
- `sessions/[sid]/gaps` (GET)
- `sessions/[sid]/draft` (GET)
- `jobs/[job_id]` (GET)
- `knowledge/entries` (GET)
- `knowledge/entries/[id]` (GET)
- `knowledge/entries/[id]/revisions/[rev]` (GET)
- `knowledge/confirmations` (POST)
- `workmap` (GET)
- Tests: `knowledge/knowledge.routes.test.ts`; `health/route.test.ts` is updated.

**Docs:** `notes/ws6-api-v0.md` is updated: S2 rows marked, new §5.12, and D16–D28 in §9.

## Verification evidence

Run in `web/` at `6346107`:

```
$ npm run typecheck
> track-inspect-web@0.1.0 typecheck
> tsc --noEmit
exit=0

$ npx vitest run
 Test Files  58 passed (58)
      Tests  786 passed (786)
```

There were 713 tests after the WS5 merge and before any S2 code, so 73 are new. The seven S2 test files (75 tests, including the updated health tests) are:

| File | Tests |
|---|---|
| `contracts/synthesis.test.ts` | 14 |
| `backend/knowledge.test.ts` | 18 |
| `backend/synthesis.test.ts` | 16 |
| `backend/confirmations.test.ts` | 12 |
| `backend/workmap.test.ts` | 9 |
| `app/api/knowledge/knowledge.routes.test.ts` | 3 |
| `app/api/health/route.test.ts` | 3 |

**Acceptance criteria → tests**

| Criterion | Test |
|---|---|
| Synthesis on fixtures creates rev-1 with valid frontmatter and resolvable image links | `synthesis.test.ts` "creates rev-1 with valid frontmatter, verbatim lines, STUB marking and resolvable image links" (stub) and "creates rev-1 entries whose frontmatter is valid and whose image links resolve" (real WS5) |
| Re-run on unchanged inputs → no new revision | `synthesis.test.ts` "re-running on unchanged inputs creates no new revision" (stub and real; the file listing is identical) |
| Exchange updated during a running job → discarded | `synthesis.test.ts` "an exchange updated during a running job discards it; nothing is persisted" (gated module; `discard_reason: exchange_changed:x-1`, no entries, no workflow, `synthesis.discarded`) |
| Confirming the current revision → confirmed | `confirmations.test.ts` "confirming the current revision → confirmed (status record; revision file unchanged)" |
| Confirming a revision superseded after review → 409, no status change | `confirmations.test.ts` "a revision superseded after review → 409 stale_revision…" (also not overridable with a fresh key); the real-WS5 correction flow; the route test "a stale confirmation is a 409…" |
| No valid on-record expert exchange → 400/409 | `confirmations.test.ts` cases: missing, off-record, unanswered, another session (all `400 validation_failed` with `details.reason`, nothing stored) |
| Replaying a confirmation is idempotent | `confirmations.test.ts` "replaying a confirmation is idempotent…" and "a replay completes a confirmation interrupted…"; route test (201 then 200, same body) |
| The Work Map links every step to image URLs that return 200 and to verbatim exchange lines; a broken link is reported | `workmap.test.ts` "links every confirmed step to image URLs that return 200…" (URLs fetched through the real asset route handlers), "reports a missing asset image and a missing exchange as broken links…", "a workflow link to a revision that is not stored…"; all run with both stub and real |

Other covered cases: one active job per session; module error → `failed` with no content leaked; `revision_conflict`; `dangling_reference` (asset or exchange); `invalid_output`; interrupted job recovery; newcomer, aborted and unknown sessions refused; `unresolved`; the WS3 `ExpertConfirmation` form; unknown revision → 404; revisions from several sessions → 400; corrected → rev-2 with parent = the reviewed revision (real WS5); a superseded confirmed revision disappears from the default Work Map.

### Live run (`npm run dev -- -p 3006`, real WS5 module)

```
$ curl -s localhost:3006/api/health | jq -c
{"ok":true,"schema_version":"ws6.v0","knowledge_dir_writable":true,"runtime_dir_writable":true,"modules":{"synthesis":{"id":"ws5-synthesis","version":"0.2.0","source":"live"}}}

$ npm run replay-capture        → OK  session ses-20261003232151-lzuwjj (4 assets, 4 events, 1 exchange)
$ curl -X POST …/sessions/$S/synthesis     → {"job_id":"job-20261004001628-…"}   (a 2nd POST while running returned the same job_id)
$ curl …/jobs/$J                → {"status":"done","revision_ids":["rev-20261004001628-s460ua"]}
$ curl …/sessions/$S/draft      → {"revision_ids":["rev-20261004001628-s460ua"],"reviewed":[{"entry_id":"ent-evt-001-step",…}],"teach_back":"To interpret a trace like this: First, at the first region you pointed to, check what you described: \"FIXTURE expert answer line 1\" and \"FIXTURE expert answer line 2\". Is that right, or what should I change?",…}
$ curl …/sessions/$S/gaps       → 2 gaps: unclear_guardrail, missing_reason
rev-1.md image links: OK ../../images/fx-lzuwjj-a1/highlighted.png, OK ../../images/fx-lzuwjj-a1/original.png
rev-1 frontmatter: evidence {"event_ids":["evt-001"],"exchange_ids":["fx-exchange-001"],"asset_ids":["fx-lzuwjj-a1"]}

PUT teach-back exchange fx-teach-001 → 201
POST /api/knowledge/confirmations {reviewed_revision_ids:[rev-…s460ua], result:"confirmed", expert_response_exchange_id:"fx-teach-001", idempotency_key:"live-tb-1"} → 201
  {"confirmations":[{"confirmation_id":"cnf-20261004001643-qxtm62","reviewed_revision_id":"rev-20261004001628-s460ua","result":"confirmed","expert_response_exchange_id":"fx-teach-001","at_utc":"2026-10-04T00:16:43.515Z","step_ids_reviewed":["ent-evt-001-step"],"source":"fixture","session_id":"ses-20261003232151-lzuwjj","entry_id":"ent-evt-001-step"}]}
same POST again → 200 (same record)
POST with expert_response_exchange_id "fx-nope" → 400 {"error":{"code":"validation_failed",…,"details":{"reason":"exchange_not_found","exchange_id":"fx-nope"}}}
```

`GET /api/workmap` excerpt:

```json
{
  "include": "confirmed",
  "produced_by": { "id": "ws5-synthesis", "version": "0.2.0", "source": "live" },
  "excluded": [],
  "steps": [{
    "position": 1, "entry_id": "ent-evt-001-step", "revision_id": "rev-20261004001628-s460ua",
    "status": "confirmed", "is_current": true, "source": "fixture", "title": "Step at evt-001",
    "evidence": [{ "event_id": "evt-001", "asset_id": "fx-lzuwjj-a1",
      "original_url": "/api/assets/fx-lzuwjj-a1/original", "highlighted_url": "/api/assets/fx-lzuwjj-a1/highlighted",
      "region": { "x": 0.2, "y": 0.15, "width": 0.15, "height": 0.25, "coordinate_space": "original_frame_normalized", "frame_width_px": 320, "frame_height_px": 180 } }],
    "exchanges": [{ "exchange_id": "fx-exchange-001", "question": "FIXTURE question 1",
      "answer_lines": [
        { "text": "FIXTURE expert answer line 1", "at_utc": "2026-10-03T10:00:12.000Z", "transcript_line_id": "fixture-line-001" },
        { "text": "FIXTURE expert answer line 2", "at_utc": "2026-10-03T10:00:15.000Z", "transcript_line_id": "fixture-line-002" } ] }],
    "broken_links": [],
    "content": { "expert_words": [ { "exchange_id": "fx-exchange-001", "question": "FIXTURE question 1", "quote": "FIXTURE expert answer line 1" }, "…" ], "…": "…" }
  }]
}
/api/assets/fx-lzuwjj-a1/original 200 image/png
/api/assets/fx-lzuwjj-a1/highlighted 200 image/png
```

**Correction and stale revision:**

```
PUT fx-exchange-001 rev 3 (+ "FIXTURE correction: only if FIXTURE cue D is present.") → 200
POST synthesis → done, revision_ids [rev-…x7gwfp (ent-evt-001-step rev-2), rev-…hdzg8m (ent-evt-001-exception rev-1)]
rev-2.md: parent_revision_id "rev-20261004001628-s460ua", change_reason "content changed with the same support (fx-exchange-001)"
POST confirmation of rev-1 again → 409 {"error":{"code":"stale_revision",…,"details":{"stale_revision_ids":["rev-20261004001628-s460ua"],"current_revision_ids":["rev-20261004001653-x7gwfp"]}}}
GET /api/workmap → steps 0, excluded [ent-evt-001-step rev-2 "not_confirmed: status is draft", ent-evt-001-exception "not_confirmed: status is draft"]
GET /api/workmap?include=draft → 2 steps, status draft, broken_links []
status.ndjson: only rev-1 draft→confirmed (cnf-…qxtm62); rev-1.md bytes unchanged
SSE replay (?after=0): synthesis.started/done ×3, revision.created ×4, draft.updated ×3, gaps.updated ×3, confirmation.stored ×1 (plus S1 types)
```

The 3 synthesis runs include one from before I reset the live data. I fixed `asset_ids`, deleted the first run's knowledge output and re-ran.

**Diag hygiene:** 21 synthesis/knowledge lines. The keys across all lines are only `at_utc, component, duration_ms, error_code, ids, op, outcome`. No line contains "FIXTURE", "answer" or "question", and no job file contains "FIXTURE".

**Live stub run** (`WS5_MODULES=stub`, with separate dirs under `web/.runtime/stub-demo/`, which is gitignored):
- `health.modules` = `{"synthesis":{"id":"ws6-stub-synthesis","version":"0.1.0","source":"stub"}}`.
- The job ended `done` and the draft's `teach_back` was `null`.
- The rev-1 body starts with `# STUB SYNTHESIS — not expert knowledge` and lists 4 screen moments and the 2 verbatim answer lines as blockquotes.
- All 8 image links resolve, and `workflow.md` is marked STUB.

Both dev servers were stopped afterwards. The live-run output in `knowledge/entries/` and `knowledge/workflow.md` is fixture data. It is left in the worktree, **uncommitted**, for the gate.

## API/contract changes

All of this is in `notes/ws6-api-v0.md` §5.12 and D16–D28.

- **New routes:** the 9 routes listed under "Delivered".
- **`GET /api/health.modules`** is now `{ synthesis: { id, version, source } }`.
- **Gaps** returns a `GapsView` wrapper (`job_id`, `produced_by`, `gaps`), not a bare `Gap[]`, so WS3 can see whether the gaps came from the stub.
- **Revision read** returns `{ revision, status, markdown }`; `status` is the status now.
- **Entry read** adds `revisions[]`.
- **Confirmation errors:**
  - `stale_revision` returns `details.stale_revision_ids` and `details.current_revision_ids`.
  - `validation_failed` returns a `details.reason`: `exchange_not_found`, `exchange_off_record`, `exchange_no_answer`, `revision_sessions` or `step_not_reviewed`.
  - `not_found` is returned for an unknown revision.
  - `invalid_transition` is returned when WS5 `nextStatus` refuses the change.
  - `conflict_immutable` is returned when a key is reused with a different body.
- **New contract fields:** listed under "Delivered".
- **Job `error.code` values:** `module_error`, `invalid_output`, `dangling_reference`, `revision_conflict`, `interrupted`, `internal`.
- **New runtime data:** `RUNTIME_DIR/jobs/` and `RUNTIME_DIR/idempotency/confirmations/`, plus `knowledge/sessions/<sid>/{gaps,draft}.json` and `knowledge/entries/<id>/status.ndjson`.

## Decisions made

D16–D28 are in the API doc §9, with the rationale in `specs/004-…/plan.md`. The ones to check at the gate:

1. **WS5 Sprint 2 is merged into this branch (D28, your decision).**
   - WS5 code therefore reaches `worktree-ws06-backend`/`voice` through this branch.
   - If you also merge `worktree-ws05-sprint-2` into `voice` directly, git will see the same commits and no conflict is expected.
2. **WS5 semantics win where they differ from the prompt.**
   - `corrected` on a *confirmed* revision drops it to `unresolved` (WS5 `nextStatus`). On a draft it stays draft, as the prompt says.
   - In the Work Map, revoked entries never show, even with `include=draft` (WS5 rule). The prompt said `include=draft` returns "everything".
3. **The Work Map default allows fixtures (D26).** Each step carries `source`. Without this, the fixture-only demo would show an empty map. Newcomer teaching eligibility in S3 must stay strict (`allow_fixture: false` unless explicitly allowed).
4. **The status of an immutable revision (D17)** is in `status.ndjson` and `current.json`. Frontmatter `status` is always the creation status (`draft`).
5. **Dedupe compares only against the latest revision (D19).** The prompt says "dedupe by (entry_id, sha256)". If content reverts to an older revision's content, a new revision is created, so the workflow link stays valid.
6. **The stub's teach-back is `null`.** For the stub, the draft's `revision_ids` = the linked stub revision, so the gate can still confirm it.
7. **No `session.updated` on confirmation.** The API doc listed it, but nothing in the session changes.
8. **Spec-kit was a manual pass.**
   - `/speckit-specify` was invoked; plan, tasks and checklist were written by hand in the spec-kit layout.
   - `/speckit-clarify` was not needed.
   - There was no separate `/speckit-analyze` run.
   - Lanes were implemented sequentially, without nested worktrees (D28).
9. **TDD:** tests were written before or together with each module. The first runs were green except two real defects, both fixed:
   - WS5 gap IDs contain `_`, so `gap_id` is not an `Id`.
   - Newcomer sessions can't be created via `createSession` before S3, so the test writes the record directly.

## Stubs still in place

- **None by default.** The real WS5 synthesis is active.
- The stub stays selectable with `WS5_MODULES=stub` (restart the dev server). It is reported in `/api/health.modules`, and every output says `source: "stub"`.
- **To swap a future WS5 version:** nothing to do as long as `createWs6SynthesisModule` keeps its signature. The adapter is in `modules.ts` (`ws5Provider`).

## Known limitations / open issues

- **WS5's committed-output test depends on gitignored files.**
  - `web/lib/knowledge/synthesis-out.test.ts` (WS5) reads `web/fixtures/ws5/synthesis/out/`.
  - `web/.gitignore` ignores `out`, so those files were never committed, and a fresh checkout fails 2 tests.
  - I regenerated them locally with WS5's own script (`npx tsx lib/knowledge/dev/synthesize-fixtures.mts`). They are identical to WS5's worktree and still ignored.
  - See "Requests to partner workstreams".
- **`workflow.md` reflects the latest synthesis run** (any session). Two expert sessions overwrite each other's workflow. The Work Map follows the latest one.
- **Any knowledge change discards a running job.** A job snapshots every entry's current revision, so synthesis of session B or a new confirmation discards session A's running job. This is correct but conservative; re-run it.
- **Revision lookup by ID scans `knowledge/entries/`.** Fine at demo scale.
- **`flagged_for_reconfirmation` is surfaced but not enforced.** It appears in the draft view, but eligibility does not yet exclude flagged revisions. This is for S3 (WS5 request).
- **`gap_answers` is not passed to WS5**, because no producer exists yet (WS3).
- **A confirmed revision superseded by new data stays `confirmed` in its log.** It is not current, so it is never shown or teachable. This happens without any `corrected` confirmation.
- **Single process.** The job registry and locks are in memory; a restart marks the running job `interrupted` the next time that session is synthesized.
- **There is no automatic synthesis on lifecycle `end`.** WS3 triggers it (WS3-Q7 is still open).

## Requests to partner workstreams

- **WS5**
  - Commit `web/fixtures/ws5/synthesis/out/`: add `!fixtures/ws5/synthesis/out/` to `web/.gitignore` (it currently ignores `out`), or move the output. Otherwise `synthesis-out.test.ts` fails on every fresh checkout.
  - `PointingEvent` carries no `asset_id`, so `VisualEvidence.asset_id` is always null. WS6 now fills `evidence.asset_ids` from the stored events. Accept an optional `asset_id` on events if you want it in the content too.
  - WS6-Q3 (status storage) and WS6-Q4 (`current.json` shape) are answered in §5.12: `{ entry_id, current_revision_id, current_revision_no, status, updated_at_utc, rev }`.
- **WS3**
  - Trigger with `POST /api/sessions/:sid/synthesis` and wait for `synthesis.done` (or poll `GET /api/jobs/:id`).
  - Then `GET …/draft` and `GET …/gaps`.
  - Confirm with **exactly** `draft.revision_ids` as `reviewed_revision_ids`.
  - For a correction, send `result: "corrected"` and `step_ids_reviewed: [<the one corrected entry_id>]`, store the correction exchange first, then trigger synthesis again and confirm the new `draft.revision_ids`.
  - On `409 stale_revision`, re-read the draft and read back again.
  - `gap_id` from `begin_question` would let WS5 close gaps precisely (`gap_answers`).
- **WS7**
  - Render `GET /api/workmap` steps:
    - `evidence[].highlighted_url` / `original_url`, with `region`;
    - `exchanges[].answer_lines` verbatim;
    - `content.expert_words` and `content.synthesis` styled differently;
    - `broken_links` visibly;
    - the `source` badge (fixture or stub).
  - Use `?include=draft` for the expert's review screen.
  - Refresh on `confirmation.stored`, `revision.created` and `draft.updated` on the expert session's stream.

## Human gate checklist (~20 min)

Set `WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`.

1. **Start the server and synthesize.**
   1. In terminal 1:
      ```
      cd "$WT/web" && npm run typecheck && npx vitest run && npm run dev -- -p 3006
      ```
   2. In terminal 2:
      ```
      cd "$WT/web" && npm run replay-capture
      ```
      Note `S=<sid>`. It is the same session ID as in my run, because the script uses a fixed idempotency key.
   3. To start from clean knowledge data first, run:
      ```
      rm -rf "$WT/knowledge/entries" "$WT/knowledge/workflow.md" "$WT/knowledge/confirmations" "$WT/web/.runtime/jobs" "$WT/web/.runtime/idempotency/confirmations"
      ```
   4. Synthesize:
      ```
      curl -s -X POST localhost:3006/api/sessions/$S/synthesis
      ```
      Then check `curl -s localhost:3006/api/jobs/<job_id> | jq .status`. It should be `"done"`.
2. **Read the revision files.** Open `$WT/knowledge/workflow.md` and `$WT/knowledge/entries/*/rev-1.md` in a Markdown viewer (e.g. VS Code preview). Check:
   - the images render;
   - the expert's words are verbatim blockquotes (`FIXTURE expert answer line 1/2`, the `fx-exchange-001` lines);
   - everything else is tagged `[AI synthesis]`.
3. **Check the stub** (optional, ~3 min).
   1. Stop the server.
   2. Run:
      ```
      WS5_MODULES=stub KNOWLEDGE_DIR=.runtime/stub-demo/knowledge RUNTIME_DIR=.runtime/stub-demo/runtime npm run dev -- -p 3006
      ```
   3. Repeat step 1, and use the session ID that `replay-capture` prints this time.
   4. Open `web/.runtime/stub-demo/knowledge/entries/*/rev-1.md`. It should be headed "STUB SYNTHESIS — not expert knowledge", show `source: stub`, and contain only verbatim lines.
4. **Confirm rev-1.**
   1. `R=$(curl -s localhost:3006/api/sessions/$S/draft | jq -r '.revision_ids[0]')`
   2. PUT a teach-back exchange. Copy the JSON from "Live run" above: `fx-teach-001`, `phase: "teach_back"`, one answer line, `rev: 1`.
   3. Confirm:
      ```
      curl -s -X POST -H 'content-type: application/json' -d '{"reviewed_revision_ids":["'$R'"],"result":"confirmed","expert_response_exchange_id":"fx-teach-001","idempotency_key":"gate-1"}' localhost:3006/api/knowledge/confirmations
      ```
      Expect `201`; the same command again gives `200`.
   4. Then `curl -s localhost:3006/api/workmap | jq`. Check that the step is `confirmed`, that `broken_links` is `[]`, and that both image URLs return 200:
      ```
      curl -I localhost:3006/api/assets/<aid>/highlighted
      ```
5. **Correct, then try the stale confirm.**
   1. Update the exchange with a higher rev and an extra line:
      ```
      curl -s localhost:3006/api/sessions/$S/exchanges/fx-exchange-001 | jq -c '.rev += 1 | .answer_lines += [{"text":"FIXTURE correction: only if FIXTURE cue D is present.","at_utc":"2026-10-03T10:00:17.000Z","transcript_line_id":"fixture-line-003"}]' > /tmp/x.json
      curl -X PUT -H 'content-type: application/json' -d @/tmp/x.json localhost:3006/api/sessions/$S/exchanges/fx-exchange-001
      ```
   2. Synthesize again. Check that `ent-evt-001-step/rev-2.md` exists with `parent_revision_id` = rev-1.
   3. Re-run the confirm command from step 4 with a new `idempotency_key`. Expect **`409 stale_revision`**, with `current_revision_ids` naming rev-2.
   4. Run `GET /api/workmap` again. It should now show 0 steps, with the drafts listed in `excluded`.
6. **Decide on the decisions** above (items 1–7), especially WS5 semantics vs the prompt, fixtures in the Work Map, and the gaps wrapper shape.
7. **If satisfied, merge:**
   ```
   cd "$WT" && git checkout worktree-ws06-backend && git merge --no-ff 004-ws6-knowledge-confirmation
   ```
   Merge `worktree-ws06-backend` into `voice` when partners should receive it. This also delivers WS5 Sprint 2 to `voice`. Before committing anything, delete or keep the uncommitted live-run output in `knowledge/entries/` and `knowledge/workflow.md`, which is fixture data.

## Notes for the next sprint (S3: newcomer, evaluation, commit)

- **Pinning:** call `selectEligible` (from `@/lib/knowledge`) with candidates built like `workmap.ts` `ws5Content()`. That function injects the WS6 status and confirmation evidence, because revision files never carry them. Pass `current_revision_by_entry` as `rev-<current_revision_no>` (WS5 numbering) and `allow_fixture: false` unless `?allow_fixture_knowledge=1`.
- **Flagged revisions:** consider excluding `flagged_for_reconfirmation` revisions (from `draft.json`) from pinning.
- **Locks:** reuse `withKnowledgeLock`, with lock order session → knowledge.
- **Newcomer drafts:** `GET /api/sessions/:sid/draft` currently 404s for newcomer sessions; S3 serves `LearnerDraft` there.
- **Off-record discard:** jobs already re-check inputs before persisting. S4's off-record discard can add a generation token to `inputChange()` in `synthesis.ts`.
