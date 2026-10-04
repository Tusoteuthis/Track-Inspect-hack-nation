# WS6 status and pickup guide (read this first)

**Last updated:** 2026-10-04, after integration steps I1, I2 and I4 (WS6↔WS7). See §0.

## 0. Integration with WS7 (newest work, read first)

- **Plan:** `notes/ws6-ws7-integration-plan.md` (gaps G1–G20, steps I1–I6, human decisions in §6).
- **I1 done.** Branch `integration-ws6-ws7` (worktree `.claude/worktrees/integration-ws6-ws7`) = `voice` + `006` + `ws7-sprint-4`; all gates green.
- **I2 + I4 done** on branch `007-ws6-integration-routes`, cut from `integration-ws6-ws7`, in this worktree. It adds:
  - `GET /api/cases`
  - expert `case_id`
  - the `paused` lifecycle
  - `GET …/review` and review marks
  - the wire recordings in `web/fixtures/ws6/wire`
  - e2e C9

  Contract: api-v0 §5.15 and decisions D53–D58.
- **Gate:** 52/52 e2e, full vitest green.
- **Next:**
  - The human merges `007` into `integration-ws6-ws7`.
  - WS7 does I3/I5 against it (their gap list in the plan §3).
  - WS3 answers `notes/ws6-sprints/request-ws3-voice-to-ws6.md`.


All five WS6 sprints (S0–S4) are **implemented**. None of S2–S4 is merged yet; each **human gate** is still pending. There is no WS6 code left to write unless a gate or a partner asks for changes.

## 1. Where the work is

| Branch | Contains | Handoff | Merged into `worktree-ws06-backend`? |
|---|---|---|---|
| `001-ws6-foundation-contracts` | S0 | [handoff-sprint-0.md](handoff-sprint-0.md) | yes |
| `002-ws6-expert-capture` | S1 | [handoff-sprint-1.md](handoff-sprint-1.md) | yes |
| `004-ws6-knowledge-confirmation` | S2 (+ WS5 Sprint 2 merged in) | [handoff-sprint-2.md](handoff-sprint-2.md) | **no** (gate pending) |
| `005-ws6-newcomer-presave` | S3, branched from `004`; also merges `worktree-ws05-sprint-3` and `voice` @ `289de30` | [handoff-sprint-3.md](handoff-sprint-3.md) | **no** |
| `006-ws6-trust-demo` | S4, branched from `005`. It contains S2+S3+S4. | [handoff-sprint-4.md](handoff-sprint-4.md) | **no** |
| `integration-ws6-ws7` | `voice` + `006` + WS7 `ws7-sprint-4` (I1) | integration plan | — (merged into `voice` after the gates) |
| `007-ws6-integration-routes` | I2 + I4, from `integration-ws6-ws7`. **This is the WS6 tip.** | §0 above, api-v0 §5.15 | **no** |

**The branches are stacked** (human decision): S3 needed S2 merged first, and S4 needed S3. Merging `006-ws6-trust-demo` into `worktree-ws06-backend` delivers S2, S3 and S4 at once. `voice` had no commits beyond what `006` contains as of 2026-10-04.

Worktree: `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`. Start agents there (see [AGENT-START.md](AGENT-START.md)). Never use `git stash`, because the stash stack is shared across worktrees.

## 2. Verify the state in 5 minutes

```bash
cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend
git checkout 006-ws6-trust-demo
cd web && npm install
npm run typecheck                    # exit 0
npx vitest run                       # 92 files, 1165 tests, all pass (last session: 9 green full runs in a row after the last fix)
KNOWLEDGE_DIR=.runtime/e2e/knowledge RUNTIME_DIR=.runtime/e2e/runtime npm run dev -- -p 3006   # terminal 1
npm run e2e -- --runtime-dir .runtime/e2e/runtime                                              # terminal 2: ALL PASS (52 checks since integration I4; 45 before)
```

Stop the dev server afterwards (`pkill -f "next dev -p 3006"`). Port 3006 is WS6's.

## 3. What exists (map of the code)

Everything is under `web/`. The full route and field contract is [`notes/ws6-api-v0.md`](../ws6-api-v0.md). Its implementation notes per sprint are §5.11 (S1), §5.12 (S2), §5.13 (S3) and §5.14 (S4), and decisions D1–D52 are in §9.

| Area | Files |
|---|---|
| Contracts (zod, `ws6.v0`) | `lib/contracts/*.ts`; S3 `learner.ts`; S4 `trust.ts` |
| Storage, IDs, locks, SSE | `lib/backend/{store,ids,locks,bus,sse,paths,config,diag}.ts` |
| Expert capture (S1) | `lib/backend/{sessions,session-lifecycle,assets,events,exchanges}.ts` |
| Knowledge (S2) | `lib/backend/{modules,synthesis,synthesis-stub,knowledge,confirmations,workmap,jobs,ws5-content}.ts` |
| Newcomer / pre-save (S3) | `lib/backend/{cases,newcomer,learner,learner-store,commit-policy,outcome-policy.json,assessment,tutor-stub}.ts` |
| Trust (S4) | `lib/backend/{off-record,tombstones,cascade,access,diagnostics,health}.ts`, `proxy.ts` |
| Routes | `app/api/**/route.ts` (thin wrappers around `lib/backend`) |
| Dev page | `app/diagnostics/page.tsx` |
| Scripts | `scripts/replay-capture.mts` (`npm run replay-capture`), `scripts/e2e-integration.mts` (`npm run e2e`) |
| Fixtures | `fixtures/ws6/` (incl. `cases/fx-n01`, `fx-n02` unseen, `fx-e01` shown to expert) |
| Run docs | `web/README.md`, `notes/ws6-failure-recovery.md`, `web/.env.example` |
| Specs | `specs/004-ws6-knowledge-confirmation/`, `specs/005-ws6-newcomer-presave/plan.md` (S4 decisions live in the API doc) |

Hosted partner modules (WS5, in `lib/knowledge/`):
- **Synthesis:** real WS5 by default; `WS5_MODULES=stub` switches to the stub.
- **Tutor evaluator:** the **stub by default**; `WS5_MODULES=real` together with `ANTHROPIC_API_KEY` switches to the real WS5 judge.
- **Assessment:** a WS6 stub, because WS5 has no assessment module yet.

`/api/health.modules` shows which are active.

## 4. Decisions a successor must not undo by accident

- **S0 D9/D10 naming is kept, not the S3 prompt's names.**
  - SSE events are `evaluation.updated` and `commit.stored`.
  - Commit refusals use the S0 error codes, with the `canCommit` code in `error.details.policy_code` (`knowledge_changed` → `evaluation_stale`; `blocked_by_outcome`/`already_committed` → `commit_blocked`).
  - This choice is still awaiting human confirmation.
- **Off-record writes get `202 dropped_off_record`** plus a content-free tombstone. Deleted IDs get `410 gone`. Learner drafts while off-record still get `403 off_record`.
- **Deletion and off-record purge revoke *and redact* the revisions that cite them** (body replaced, frontmatter kept). A plain revocation keeps the text.
- **Cascades bump `Session.generation` of the owning sessions *before* loading their graph** (D49). This fixed a real race found by the e2e run. Synthesis jobs and evaluations discard their result if the generation moved.
- **Fixture knowledge is never pinned silently:** a newcomer session needs `?allow_fixture_knowledge=1`. Stub-synthesis revisions count as fixture material.
- **`allow_with_escalation` (outcome `uncertain`) needs `escalated: true`** on the commit request. Unknown outcomes block.
- **No automatic re-pin after revocation.** The client calls `POST /api/sessions/:sid/pin`.
- **Evaluator separation:** only `config.ts`, `paths.ts` and `assets.ts` may mention the evaluator directory. `cases.test.ts` greps for it.

## 5. Open items (in order)

1. **Delete the leftover fixture data.** The worktree has untracked `knowledge/entries/…` and `knowledge/workflow.md` from the S2 live run. These paths are deliberately *not* gitignored (real knowledge is committable), so do not `git add -A` at the repo root. Delete them (`rm -rf knowledge/entries knowledge/workflow.md`) unless the S2 gate needs them.
2. **Human gates S2 → S3 → S4.** Exact steps are at the end of each handoff. Then:
   ```
   git checkout worktree-ws06-backend && git merge --no-ff 006-ws6-trust-demo
   ```
   Then merge `worktree-ws06-backend` into `voice` from the main checkout. This also delivers WS5 Sprints 2 and 3. If WS5 merged its Sprint 4 into `voice` in the meantime, expect overlaps in `web/lib/knowledge/`.
3. **Human decisions** (handoff S3 §Decisions 2–4, S4 §Decisions 1–3):
   - D9/D10 naming;
   - escalation needs `escalated: true`;
   - explicit re-pin;
   - redaction on deletion.
4. **Partner requests** (each handoff's "Requests to partner workstreams"):
   - **WS5:** agree the outcome policy table; make the same one-line `question_planned: null` fix in `lib/knowledge/gaps.test.ts` (WS6 changed it); provide an assessment module; decide re-synthesis vs. revocation after deletion.
   - **WS4:** deliver learner cases in `cases/learner/<id>/` (lowercase IDs); put the answer key in `EVALUATOR_DIR`, outside git.
   - **WS2:** treat `202` as success and `410` as final; send the Bearer token when it is enabled.
   - **WS3:** use `since_utc` for "that was off the record"; start the newcomer session before requesting tutor tokens.
   - **WS7:** draft → evaluation → commit routes; map refusals by `policy_code`; handle `entry.revoked` and `record.deleted`.
5. **Never run live yet:**
   - the real tutor judge (no `ANTHROPIC_API_KEY`);
   - ElevenLabs voice (`web/.env` has the key but no agent IDs);
   - a real iPhone pointing event end to end (S4 gate step 4).

## 6. Known limitations

- **Single process, in-memory locks and SSE bus, LAN only.** Not for serverless or multiple instances. Public deployment is not configured and needs explicit authorization.
- **`knowledge/workflow.md` reflects the latest synthesis run** of any session. It is not redacted on deletion; it holds AI titles and IDs only, and re-synthesis regenerates it.
- **Evaluations and synthesis run in-process.** After a restart, pending work becomes `failed (interrupted)` on the next request.
- **The access token is one shared secret without TLS.** Its limits are in `web/README.md` §5.

## 7. Session log (2026-10-04, this session)

- **Analysis and setup.**
  - Read both sprint prompts, the S2 handoff, the API doc and partner code.
  - Asked the human two questions: stack the branches (yes), and merge WS5 Sprint 3 with the tutor stub as default (yes).
  - Created `005` from `004` and merged in `worktree-ws05-sprint-3` and `voice` (one `.gitignore` conflict, both sides kept).
  - Fixed WS3's new required `question_planned` (the zod schema defaults it to null).
- **S3:**
  - contracts; cases and evaluator guard; pinning via WS5 `selectEligible`;
  - drafts, evaluations (stale handling) and the pure `canCommit` + policy JSON;
  - commit with idempotency; the stub assessment;
  - routes and tests (69 new);
  - a live curl run, which found and fixed the timeline-order bug (`completed_at_utc`);
  - realigned naming to D9/D10; wrote handoff-sprint-3.
- **S4:**
  - created `006` from `005`;
  - **Lane A:** off-record drop + `since_utc` purge, tombstones, cascade, generation tokens, revoke/DELETE routes;
  - **Lane B:** access token proxy, health components, diagnostics API + page;
  - **Lane C:** the e2e script, README, failure notes, API doc §5.14 and D42–D52;
  - the e2e run found the cascade/job race (fixed, D49);
  - fixed a test flake (stream-close diag vs. temp-dir cleanup);
  - wrote handoff-sprint-4.
- **Not done** (by design; the agents don't merge): no merges into `worktree-ws06-backend` or `voice`, no pushes, no partner code changes apart from the one-line WS5 test fix noted above.
