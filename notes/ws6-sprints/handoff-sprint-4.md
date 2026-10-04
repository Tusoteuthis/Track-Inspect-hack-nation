# WS6 Sprint 4 handoff — Trust, recovery, diagnostics & integrated demo

**Branch:** `006-ws6-trust-demo`, stacked on `005-ws6-newcomer-presave` (S3), which is stacked on `004-ws6-knowledge-confirmation` (S2). Neither is merged into `worktree-ws06-backend` yet (human decision, 2026-10-04).
**Spec/plan:** this sprint was planned directly from the prompt. The decisions are D42–D52 in `notes/ws6-api-v0.md` §9, with notes in §5.14.
**Date:** 2026-10-04

## Delivered

**Lane A: off-record, cascade, generation tokens, tombstones** (`web/lib/backend/`)
- `off-record.ts`:
  - `isOffRecordAt` / `isOffRecordWrite` (label, current state, or capture time inside an off-record segment);
  - `onRecordLines` (cuts answer lines spoken off the record).
- `tombstones.ts`: content-free tombstones in `knowledge/tombstones/`. A `dropped` tombstone answers `202 dropped_off_record`; a `deleted` one answers `410 gone`.
- `assets.ts`, `events.ts`, `exchanges.ts`: off-record writes now get `202 { status: "dropped_off_record", kind, id }`, with no bytes and no record written. Deleted IDs get `410 gone`.
- `cascade.ts`:
  - the pure `computeCascade(graph, roots)` and `loadCascadeGraph`;
  - `applyPlan`, which writes tombstones, then bumps generations, removes files, revokes and redacts revisions, invalidates evaluations, and emits SSE;
  - `deleteEvent`, `deleteExchange`, `deleteAsset`, `deleteSession`, `revokeEntry`, and `setRecordState` (with the `since_utc` purge).
- `sessions.ts`: `bumpGenerationLocked` and `requireLiveSession`; `getSession` → `410` for a deleted session.
- `session-lifecycle.ts`: backdated off-record segments (`since_utc`).
- `bus.ts`: never recreates a deleted session's directory.
- `knowledge.ts`: `redactRevisionFile`; `appendStatusTransition(reason)`.
- `learner.ts`: `invalidateEvaluationsLocked` (stale + scrub quotes), and a generation check in `finishEvaluation`.
- `synthesis.ts`: `input_revs.generation` → `discard_reason: generation_changed:a->b`.

**Lane B: access, health, diagnostics**
- `web/proxy.ts` (Next 16 proxy) and `lib/backend/access.ts`:
  - `BACKEND_ACCESS_TOKEN` → `/api/*` (except `/api/health`, `/api/access`) needs `Authorization: Bearer` or the `ws6_access` cookie;
  - `app/api/access/route.ts` sets the cookie (HttpOnly, SameSite=Strict, holding the token's SHA-256) and redirects to a relative `next`.
- `lib/backend/health.ts`: `elevenlabs` booleans, `access_token_required`, per-component `components` (from the diag log) and `failing_components`.
- `lib/backend/diagnostics.ts` + `app/api/diagnostics/route.ts`:
  - expert chain `event → exchanges → revisions → confirmations → newcomer sessions → evaluations → commit`, plus jobs;
  - newcomer chain;
  - per-component status and the session's diag timeline.
- `app/diagnostics/page.tsx`: a read-only dev page.
- `lib/backend/sse.ts`: logs a `stream close` diag line, so a dropped client is visible.

**Lane C: e2e and run docs**
- `web/scripts/e2e-integration.mts` (`npm run e2e -- [--base] [--token] [--runtime-dir]`).
- `web/README.md` (new):
  - prerequisites and `.env` keys;
  - local/LAN start and finding the IP;
  - the access boundary: what it protects and what it does not;
  - stubs vs real modules;
  - reset and deletion.
- `web/.env.example`: all keys.
- `notes/ws6-failure-recovery.md`: per component, its symptom, how diagnostics show it, and recovery.
- `notes/ws6-api-v0.md`: §2 rules/errors/SSE, §5.1, §5.3, §5.4, §5.9, new §5.14, and D42–D52.

**Contracts** (`web/lib/contracts/`)
- `trust.ts`: `Tombstone`, `RevokeRequest` and `CascadeSummary`.
- `DroppedOffRecord`.
- `Session.generation?`.
- `RecordStateRequest.since_utc?`.
- `JobInputRevs.generation?`.
- Error code `gone` (410).

## Verification evidence

In `web/` at `4550b14`:

```
$ npm run typecheck
> tsc --noEmit
(exit 0)

$ npx vitest run          # run 6× in a row after the flake fix: 6/6 green
 Test Files  92 passed (92)
      Tests  1165 passed (1165)

$ npm run build           # production build incl. the proxy
exit 0 … ƒ Proxy (Middleware)
```

There were 1141 tests after S3, so 24 are new. The changed files are:
- `cascade.test.ts`: 15 (new)
- `access.test.ts`: 6 (new)
- `diagnostics.test.ts`: 2 (new)
- `health/route.test.ts`: +1
- the S1 off-record tests in `assets`/`events`/`exchanges`: rewritten for `202`.

**S4 acceptance criteria → tests**

| Criterion | Test |
|---|---|
| Off-record upload stores no bytes | `assets.test.ts` "off-record session → 202 dropped_off_record and no bytes written; a retry gets the same answer"; "off-record label in meta → 202"; `cascade.test.ts` "an event captured inside an off-record segment is dropped…", "answer lines spoken inside an off-record segment are never stored" |
| A retroactive off-record purge removes content and leaves tombstones | `cascade.test.ts` "a retroactive off-record purge removes content, leaves tombstones, revokes and redacts what cited it" (scans every file under `KNOWLEDGE_DIR` for the purged words) |
| A delayed job after deletion recreates nothing | `cascade.test.ts` "a delayed job after deletion recreates nothing (exchange deleted mid-synthesis)" (gated module) and "a purge that only trims lines … still discards a running job via the generation token" |
| A late retry of a deleted ID → 410 | `cascade.test.ts` "a late retry of a deleted ID → 410 gone (event, exchange, asset, session)" |
| Revocation → Work Map and pinning exclude it, and pending commits are blocked | `cascade.test.ts` "revocation → Work Map and pinning exclude it, and pending commits are blocked"; "deleting a cited exchange revokes and redacts…" |
| Diag output contains no content | `diagnostics.test.ts` "diag output and diagnostics contain no content" (the diag files and the API output, against every exchange question/answer line and the learner text); e2e row C8 (scans `RUNTIME_DIR/diag` of the run) |
| With the token set, the API rejects requests without it | `access.test.ts` "with the token set, the API rejects requests without it (401 envelope)"; e2e row C7 in the token run |
| Pure cascade rules | `cascade.test.ts` `computeCascade (pure)`, 6 cases |

### `npm run e2e` on a fresh `KNOWLEDGE_DIR` (full table)

The server was started with `KNOWLEDGE_DIR=.runtime/e2e/knowledge RUNTIME_DIR=.runtime/e2e/runtime npm run dev -- -p 3006`. Then:

```
$ npm run e2e -- --runtime-dir .runtime/e2e/runtime     → exit 0, ALL PASS (45 checks)
```

| § 10 criterion | Check | Result |
|---|---|---|
| C8 | GET /api/health ok (modules synthesis=ws5-synthesis@0.2.0(live) tutor=ws6-stub-tutor@0.1.0(stub) assessment=ws6-stub-assessment@0.1.0(stub)) | PASS |
| C7 | health reports secrets as booleans only (elevenlabs {"api_key_configured":true,"expert_agent_configured":false,"tutor_agent_configured":false}) | PASS |
| C7 | access token not configured (LAN-open demo mode) | PASS |
| C6 | off-record upload/event → 202 dropped_off_record, no bytes stored (asset 202, event 202, image GET 404) | PASS |
| C3 | late retry of a dropped asset stays dropped (idempotent) (202) | PASS |
| C6 | retroactive off-record purge removes stored content and leaves tombstones (purge 200 deleted {"asset_ids":["or-mutjs2sa-a2"],"event_ids":["evt-or-2"],"exchange_ids":["x-or-2"]}, GET 404, re-PUT 202) | PASS |
| C6 | SSE carries record_state.changed for the acknowledged state (12 events replayed) | PASS |
| C6 | deletion mid-synthesis: the delayed job recreates nothing (job discarded (generation_changed:0->1), live revisions citing it 0) | PASS |
| C3 | late retry of a deleted exchange → 410 gone | PASS |
| C3 | PUT asset (evidence frame) / asset 2 / event evt-001 / event evt-002 / exchange x-1 / exchange x-2, each sent twice (201 → 200) | PASS ×6 |
| C3 | SSE disconnect + resume (Last-Event-ID) replays exactly the missed events (resumed after seq 3: 4…7, no gaps/dupes) | PASS |
| C3 | delayed answer keeps its event; re-attaching it is refused (rev2 200, re-attach 409 conflict_immutable) | PASS |
| C1 | synthesis job done (3 revisions) | PASS |
| C3 | re-running synthesis on unchanged inputs creates no new revision (done +0) | PASS |
| C4 | confirm teach-back, sent twice (201 → 200) | PASS |
| C4 | confirmation bound to the exact reviewed revisions (3) | PASS |
| C4 | after a correction, confirming the superseded revision → 409 stale_revision | PASS |
| C4 | the corrected revision is confirmed (201, 4 revisions) | PASS |
| C2 | Work Map evidence images resolve (HTTP 200) (4 steps, 8 image URLs: 200) | PASS |
| C1 | every Work Map step links verbatim expert words and no broken links | PASS |
| C6 | fixture knowledge is not used silently (strict newcomer session refused, 409 no_confirmed_knowledge) | PASS |
| C7 | a case shown to the expert is refused for the newcomer (409 case_not_permitted) | PASS |
| C7 | learner case view carries no evaluator fields; trace resolves (fx-n01, 200) | PASS |
| C7 | evaluator path is not reachable through the asset route (400) | PASS |
| C1 | newcomer pinned the confirmed revisions (4) | PASS |
| C3 | PUT learner draft (wrong), sent twice (201 → 200) | PASS |
| C5 | commit without an evaluation → evaluation_required | PASS |
| C3 | POST evaluation, sent twice (202 → 200) | PASS |
| C5 | wrong decision → intervene, citing pinned knowledge and the expert's words | PASS |
| C5 | commit after intervene → commit_blocked / blocked_by_outcome | PASS |
| C5 | edited draft cannot use the old evaluation → evaluation_stale | PASS |
| C5 | pending evaluation cannot be bypassed (409 evaluation_pending) | PASS |
| C5 | two concurrent commits → exactly one commit (201/409) | PASS |
| C3 | commit double-submit with the same key → the same commit (200) | PASS |
| C5 | assessment records the intervention caught before save (proposed→evaluated→guidance_delivered→revised→evaluated→committed) | PASS |
| C6 | revocation after evaluation blocks the pending commit (revoke 200, commit 409 evaluation_stale/knowledge_changed) | PASS |
| C6 | revoked knowledge leaves the Work Map and newcomer pinning | PASS |
| C1 | diagnostics ID chain: event → exchange → revision → confirmation → newcomer → evaluation → commit | PASS |
| C8 | no component is failing after the run | PASS |
| C8 | diagnostics and diag files contain no content (0 hits; API output and `.runtime/e2e/runtime/diag`) | PASS |

**ID chain of `evt-001`, as printed by the run:**

```
event      evt-001 (asset mn-mutjs2sa-a1, captured 2026-10-04T08:17:07.956Z, session_time_ms 5000)
exchange   x-1 rev 2 (live, 2 line(s))
revision   ent-evt-001-step @ rev-20261004081710-1azftn rev-1 revoked (ws5-synthesis fixture)   ← revoked by the last e2e step
confirm    cnf-20261004081711-9vt4rv → rev-20261004081710-1azftn confirmed via x-tb
confirm    cnf-20261004081711-cmnbom → rev-20261004081710-1azftn confirmed via x-tb2
newcomer   ses-20261004081712-8xnh1r case fx-n01
  evaluation evl-20261004081714-jhjx2j draft_rev 1 stale intervene (ws6-stub-tutor)
  evaluation evl-20261004081714-3jj6ec draft_rev 2 stale ok (ws6-stub-tutor)
  commit     cmt-20261004081714-3fz3d8 draft_rev 2 ← evl-20261004081714-3jj6ec
newcomer   ses-20261004081715-g1a6la case fx-n01
  evaluation evl-20261004081715-tdgaqg draft_rev 1 stale ok (ws6-stub-tutor)
Work Map   rev-20261004081710-1azftn
```

The evaluations show `stale` because the revocation step at the end stales every evaluation that used the revoked revision. The commit made before the revocation stays.

**Further runs:**
- A second consecutive run on the same (non-fresh) data: exit 0, 45/45.
- `BACKEND_ACCESS_TOKEN=lan-demo-token`:
  ```
  curl /api/diagnostics                      → 401 {"error":{"code":"unauthorized",…}}
  curl -i /api/access?token=…&next=/diagnostics → 303 Location: /diagnostics,
       set-cookie: ws6_access=b3cf…b00d; Path=/; HttpOnly; SameSite=Strict
  curl -H "Cookie: ws6_access=…" /api/diagnostics → 200
  npm run e2e -- --token lan-demo-token      → exit 0, 45/45 (incl. "request without it → 401")
  npm run e2e   (no --token)                 → exit 1: step "health" aborted — the backend requires BACKEND_ACCESS_TOKEN; pass --token
  ```
- Server stopped: `npm run e2e` → `FAIL C8 step "health" aborted — backend unreachable at http://localhost:3006 during "health" (ECONNREFUSED)`.
- **The first e2e run found a real race** (now D49 + test): a synthesis job could persist while a deletion cascade was computing its plan, leaving one live revision citing the deleted exchange. Cascades now bump the owning sessions' generation (under their locks) before they load the graph, so the job is discarded. The run above shows `generation_changed:0->1`.
- **A flake was found and fixed:** the SSE close diag line could race temp-dir cleanup in tests (`ENOTEMPTY`). Pending close-log writes are now tracked, and the tests flush them.

## `notes/06-backend-integration.md` §10 checklist

| §10 criterion | How it is shown |
|---|---|
| One real pointing event traced through expert answer, confirmed entry, Work Map, newcomer feedback (stable IDs) | **auto** (fixture event): e2e C1 rows + "ID chain of evt-001"; `diagnostics.test.ts` "traces event → …". **Real event: human gate step 4** |
| Images and evidence references resolve in the actual native/backend/browser setup | **auto**: e2e C2 (Work Map image URLs 200, case trace 200), `workmap.test.ts` (S2). **Native (iPhone) and LAN browser: human gate step 4** |
| Repeated delivery, temporary disconnect, delayed processing do not duplicate or misattach | **auto**: e2e C3 (every write sent twice; SSE disconnect + `Last-Event-ID` resume; delayed exchange keeps its event; re-attach refused; commit double-submit); `events/exchanges/assets/sse` tests (S1); `learner.test.ts` concurrent commits (S3) |
| Confirmation applies only to the reviewed revision | **auto**: e2e C4 (stale confirm → 409 after correction); `confirmations.test.ts` (S2) |
| A wrong learner decision can be intercepted before save; pending/stale/changed drafts cannot bypass | **auto**: e2e C5; `learner.test.ts` + `commit-policy.test.ts` (S3). Real WS5 judge: **human gate step 4** (needs `ANTHROPIC_API_KEY`) |
| Correction, deletion and off-record propagate to storage, pending work and retrieval eligibility | **auto**: e2e C6; `cascade.test.ts` (purge, deletion mid-synthesis, generation token, 410, revocation, redaction) |
| Evaluator-only answers and permanent provider secrets are not accessible to runtime clients/tutors | **auto**: e2e C7; `cases.test.ts` evaluator separation (S3); `conversation-token/route.test.ts` (S1); `access.test.ts` |
| Start from the documented instructions and identify a failed component without guessing | **human gate steps 1–3** (README in a fresh clone; `/diagnostics`; kill the server or an SSE client); e2e C8; `health/route.test.ts` "names a component whose last request failed" |

## API/contract changes

All of these are in `notes/ws6-api-v0.md` §2, §5.1, §5.3, §5.4, §5.9, §5.14 and D42–D52.

- **Off-record writes:** `PUT` assets/events/exchanges answer **`202 { status: "dropped_off_record", kind, id }`** instead of `403 off_record` (D8 anticipated this). Learner drafts still get `403`.
- **New error code:** `gone` (410).
- **New routes:**
  - `DELETE` on `/api/sessions/:sid`, `…/events/:eid`, `…/exchanges/:xid` and `/api/assets/:aid` → `CascadeSummary`;
  - `POST /api/knowledge/entries/:id/revoke` → `{ entry, revoked_revision_id, cascade }`;
  - `GET /api/diagnostics[?session_id=]`;
  - `GET /api/access?token=[&next=]`.
- **`POST …/record-state`** accepts `since_utc`, and the response then includes `purge: CascadeSummary`.
- **`/api/health`** gains `elevenlabs{…}` booleans, `access_token_required`, `components` and `failing_components`.
- **Records:**
  - `Session.generation`;
  - `Job.input_revs.generation`;
  - `StatusTransition.reason`;
  - job `discard_reason: generation_changed:a->b`;
  - revision files may be **redacted**: frontmatter kept, body replaced by `# REDACTED — evidence deleted`.
- **SSE:** `record.deleted` and `entry.revoked` are emitted, and `session.updated` fires on every generation bump.
- **New data:** `knowledge/tombstones/` (gitignored).

## Decisions made (and why), especially deviations from the prompt

1. **Deletion and purge redact the revision body** (D47). The prompt says "revoked with the reason recorded". Revoking alone would leave the deleted or off-record words in `rev-N.md`, which contradicts "off-record means not stored" and "files are removed". Frontmatter (IDs, hashes) stays for audit. Plain revocation via the route keeps the text.
2. **Exchanges about a deleted event are deleted with it** (D46). WS5's rule says words about an off-record gesture are not teachable, and keeping them would leave a dangling `event_id`. Deleting the teach-back answer revokes the revision it confirmed.
3. **No automatic re-pin after revocation** (D50). Evaluations go stale, commits are blocked (`knowledge_changed`), `entry.revoked` reaches the newcomer stream, and the client calls `POST …/pin` (S3).
4. **Transient processing** (open team decision, D45). WS6 implements "not persisted, not forwarded to modules". On-device transient use is WS2/WS3's call.
5. **`since_utc` purge is limited to the current on-record segment** (D44), so a client cannot rewrite older history by accident.
6. **The access cookie holds a SHA-256 of the token, not the token** (D51). The redirect target must be a relative path, so it is not an open redirect.
7. **`failing_components` counts only server failures (`internal`) and module failures (synthesis/evaluations)** (D52). A client's 4xx is not a failed component.
8. **Lanes ran sequentially in this worktree** (no nested worktrees), as in S2/S3, because all three lanes share the store and lock order.

## Stubs still in place

As in S3:
- tutor: `ws6-stub-tutor` by default; `WS5_MODULES=real` uses WS5's Anthropic judge;
- assessment: `ws6-stub-assessment`;
- cases: labelled fixture cases until WS4 provides `<repo>/cases/learner/`.

All are reported in `/api/health.modules` and marked in their output. How to swap them: `web/README.md` §6.

## Known limitations / open issues

- **`knowledge/workflow.md` is not redacted** on deletion. It holds AI step titles and IDs, not expert quotes, and the next synthesis run of that session regenerates it. Revoked steps are excluded from the Work Map.
- **The Anthropic and ElevenLabs paths were not exercised live:**
  - the real tutor judge needs `ANTHROPIC_API_KEY`, which is not configured;
  - voice tokens need agent IDs: `web/.env` has an `ELEVENLABS_API_KEY` but no agent IDs (`/api/health.elevenlabs`).
- **Single process and LAN only.** Locks, the SSE bus and running jobs are in memory. Not for serverless or multiple instances. Public deployment is not configured and needs explicit authorization.
- **The cascade scans every session/entry** to build its graph. That is fine at demo scale.
- **The e2e script's "pending evaluation cannot be bypassed" check** passes either way: the stub tutor can finish before the commit arrives (the check then records `201`). Deterministic coverage is in `learner.test.ts` (gated tutor).
- **One S1 test changed for robustness:** the SSE test helper wait is now 5 s, which is harmless.
- **Diag outcome change (S2 code):** synthesis jobs that end `discarded` are now logged `ok` (the rule worked), so only `failed` jobs mark `synthesis` as failing. Evaluation runs now write their own diag line (`evaluations run`).

## Requests to partner workstreams

- **WS2 (iPhone)**
  - Treat `202 dropped_off_record` as success, not an error; retrying is safe and gets the same answer.
  - Treat `410 gone` as final: stop retrying that ID.
  - Send `Authorization: Bearer <token>` when the demo token is on.
  - Base URL is `http://<laptop-ip>:3006` (README §3).
- **WS3 (voice/expert)**
  - "That last part was off the record" → `POST …/record-state { state: "off_record", since_utc }`. The response's `purge` lists what was removed.
  - Exchange `PUT`s during off-record get `202` for new exchanges; existing exchanges keep on-record lines only.
- **WS5**
  - Confirm D46/D47 (delete cascade + redaction) against your eligibility rules: should revisions citing deleted evidence be re-synthesized instead of revoked?
  - The outcome-policy questions from S3 are still open.
- **WS7**
  - Handle the SSE events `record.deleted`, `entry.revoked` (show "knowledge changed, re-pin" on practice) and `session.updated` (generation bumps).
  - For browsers on the LAN with the token on, open `/api/access?token=…&next=/practice` once.
  - `/diagnostics` is a WS6 dev page, not part of the product UI.
- **WS4**
  - Deliver the evaluator package into `EVALUATOR_DIR` outside git (copy step to be agreed). Nothing serves it.

## Human gate checklist (~30 min)

Set `WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`.

1. **Fresh clone, README only.**
   1. Clone into a temp dir.
   2. Check out `006-ws6-trust-demo`, then `cd web && npm install && cp .env.example .env`.
   3. Follow `web/README.md` §3–§4: `npm run dev -- -p 3006`, then in a second terminal `npm run e2e -- --runtime-dir .runtime`.

   **Check:** you needed nothing beyond the README.
2. **E2E and diagnostics.** **Check:** all rows pass (45 checks). Open `http://localhost:3006/diagnostics`, click the e2e main session (role expert, newest), and follow `evt-001` → exchanges → revisions → confirmations → newcomer session → evaluations → commit in the ID chain.
3. **Break something.**
   1. Stop the dev server in the middle of `npm run e2e`. **Check:** the script prints which step aborted and `ECONNREFUSED`.
   2. Restart the server, then open an SSE client and kill it:
      ```
      curl -N localhost:3006/api/sessions/<sid>/stream
      ```
      Press Ctrl-C. **Check:** `/diagnostics` for that session shows a `stream close` line in its timeline.
   3. Optionally, set `WS5_MODULES=real` without `ANTHROPIC_API_KEY` and evaluate a draft. **Check:** `failing_components` names `evaluations`, and the evaluation is `failed` (`module_error`), not `uncertain`.
4. **Live parts where available.** Run one real pointing event (WS2) → expert answer (WS3) → teach-back confirmation → Work Map (WS7 `/map`) → newcomer intervention (`/practice`). Note which parts were live and which were fixtures or stubs:
   - tutor is a stub unless `WS5_MODULES=real` + key;
   - cases are fixtures unless WS4 cases are present.

   With `BACKEND_ACCESS_TOKEN` set:
   - **Check:** the iPhone sends the header;
   - **Check:** the browser works after `/api/access?token=…`.
5. **If satisfied, merge in order** (in `$WT`): `004-ws6-knowledge-confirmation` → `005-ws6-newcomer-presave` → `006-ws6-trust-demo`. Merging `006` alone also brings the other two, because the branches are stacked:
   ```
   git checkout worktree-ws06-backend && git merge --no-ff 006-ws6-trust-demo
   ```
   Merge into `voice` when partners should receive it. This also delivers WS5 Sprint 2 + 3 and the `voice` merge already in S3.

## Notes for follow-up

- **Partner integration:** when WS4 cases and live WS2/WS3 data exist, rerun `npm run e2e` (it only uses its own fixture sessions) plus the gate's live path.
- **Possible next step:** auto re-pin after revocation, if WS7 prefers it to an explicit `POST …/pin`.
