# WS6 ↔ WS7 integration plan (backend ↔ frontend)

Status: decisions taken 2026-10-04 (see §6). Applies to WS6 `006-ws6-trust-demo` (worktree `ws06-backend`) and
WS7 `ws7-sprint-4` (worktree `ws7-sprint-3`). Both branch from `voice@289de30`.

## 1. Where things stand

| | WS6 backend | WS7 frontend |
|---|---|---|
| Branch | `006-ws6-trust-demo` (S2→S3→S4 stacked, 92 commits ahead of voice) | `ws7-sprint-4` (S3+S4, 11 ahead of voice), plus **uncommitted styling WIP** in the worktree |
| Owns | `web/app/api/**`, `web/lib/{backend,contracts,knowledge}`, `web/proxy.ts`, `web/fixtures/ws{5,6}`, `notes/ws6-api-v0.md` | pages in `web/app/*`, `web/components/**`, `web/lib/{data,ui,companion,practice,summary,trust}`, `web/fixtures/ui`, `web/e2e` |
| Contract | zod schemas in `web/lib/contracts` (`ws6.v0`), published in `notes/ws6-api-v0.md` | `DataSource` (`web/lib/data/source.ts`), with `fixtureSource` as the default and `apiSource` + `ws6Mappers.ts` + `ws6Wire.ts` written against api-v0 **from the doc only** |
| Live today | All v0 routes and SSE; `npm run e2e` (45 checks) | Nothing. Every screen uses fixtures. `NEXT_PUBLIC_WS7_LIVE_SCREENS` switches each screen to `apiSource` |

**A trial merge is almost clean.** `git merge-tree 006-ws6-trust-demo ws7-sprint-4` has one conflict, the add/add on `web/README.md`. `package.json` merges cleanly; WS7 picks up `zod` and `@anthropic-ai/sdk`. Both sides use next 16.1 / react 19.2.

The risk is semantic, not textual. `apiSource` has never talked to a running backend. The gap list in §3 comes from comparing it with the real routes.

## 2. Principles for parallel development

1. **One wire contract, owned by WS6.** `web/lib/contracts` (zod) plus `notes/ws6-api-v0.md` are the only definitions of what goes over HTTP and SSE. WS7 imports these types. It does not copy them: `ws6Wire.ts` is deleted once the branches share a base (I3).
2. **One adapter seam, owned by WS7.** All wire↔UI translation lives in `web/lib/data/apiSource.ts` + `ws6Mappers.ts`. Components never see wire types, and routes never see UI types.
3. **Ownership boundary.** WS7 never adds or edits `app/api/**` or `lib/contracts`. WS6 never edits components or `lib/data`. A change on the other side is requested in the partner-requests section of that side's handoff.
4. **Contract changes are additive inside v0.** New routes and optional fields are fine. A rename or removal needs a decision entry (D53+) in api-v0 §9 and an update to the wire fixtures (I4) in the same commit.
5. **Shared base early, then merge often.** The merge is cheap now, and it gets more expensive with every sprint the branches stay apart.
6. **One process, same origin.** The merged app is one Next server, so `NEXT_PUBLIC_WS6_BASE_URL` stays empty. The access cookie from `proxy.ts` and the `EventSource` cookies then work without CORS.

## 3. Touch-point gap list

Severity: **B** blocks a live screen, **M** gives wrong or degraded behaviour, **L** is polish.

| # | Touch point | Today | Fix | Owner | Sev |
|---|---|---|---|---|---|
| G1 | `/practice` newcomer session | `usePracticeLoop.ts:55` makes a random `draft-<uuid>`; `apiSource` uses it as the WS6 session id, so `PUT …/draft` and `POST …/commit` hit a session that doesn't exist. `practice/page.tsx` always uses `FIXTURE_IDS` | Live: `POST /api/sessions {role:"newcomer", case_id?}` with `Idempotency-Key`, then lifecycle `start`. Put `?session=` in the URL. Use the session id for draft, evaluations and commit | WS7 | B |
| G2 | `getPracticeCase` | Rejects with "not available" | `GET /api/cases/:case_id` → `PracticeCaseView`; the trace is at `/api/cases/:id/trace`. `knowledge_revision_id` comes from `Session.pinned_knowledge` | WS7 | B |
| G3 | Draft revision | Sends `base_draft_rev = draft_revision-1`, a UI counter | Use the `draft_rev` from the last server response as `base_draft_rev`. On `stale_revision`, GET `/draft` and rebase | WS7 | B |
| G4 | Evaluation wait | Polls every 500 ms for up to 20 s | Wait for SSE `evaluation.updated` with a matching `evaluation_id`, then GET it. Keep the poll as a fallback when the stream is down | WS7 | M |
| G5 | Commit refusals | Shows `"code: message"` | Map `details.policy_code` (`evaluation_required\|evaluation_pending\|evaluation_stale\|commit_blocked`) and `outcome` to `ReviewStatus`. On `uncertain`, offer "save and escalate" (re-POST with `escalated:true` and the **same** idempotency key semantics, D37) | WS7 | M |
| G6 | `submitScreenFrame` / `visual_context` | Not available; `visual_context: []` | Multipart `PUT /api/sessions/:sid/assets/:aid` (meta + original) → `frame_id = asset_id`. The draft sends `visual_context:[{asset_id, region}]`, with the region in `original_frame_normalized`. Handle `202 dropped_off_record` | WS7 | M |
| G7 | `listCases` (expert setup + display) | No backend list route | **Add `GET /api/cases`** → `LearnerCase[]` (learner-safe, `shown_to_expert` filter optional) | WS6 | B (/expert) |
| G8 | `startSession` (expert) | Sends the case id as `trace_ref` | **Accept `case_id` on the expert `CreateSessionRequest`** (`Session.case_id` already exists) and set `trace_ref` from the case. WS7 sends `case_id` | WS6 + WS7 | M |
| G9 | `getReview` | Not available | **Add `GET /api/sessions/:sid/review`**: a session-scoped Work Map for the current revisions and their parents, `open_questions` (from gaps), and `confirmations`. WS7 maps it to `ReviewView` | WS6 + WS7 | B (/review) |
| G10 | `submitReviewMark` | Not available | **Add `POST /api/sessions/:sid/review-marks`** (`{entry_id, revision_id, kind, idempotency_key}`). It is stored as a request only, never changes knowledge, and emits SSE `review_mark.stored` so WS3 can see it | WS6 + WS7 | M |
| G11 | SSE coverage | Listens to 7 events | Also handle `evaluation.updated`, `commit.stored`, `assessment.stored`, `draft.updated`, `gaps.updated`, `synthesis.failed`, `record.deleted` | WS7 | M |
| G12 | Revocation while practising | `entry.revoked` → `knowledge` update only | Show "knowledge changed" and call `POST /api/sessions/:sid/pin`, then re-run the review (no automatic re-pin, D50) | WS7 | M |
| G13 | `deleteEvidence` result | Returns `revoked_entry_ids: []` | Map the `CascadeSummary` already in the DELETE response (`revoked_revision_ids`, `stale_evaluation_ids`) | WS7 | L |
| G14 | Pause | No backend lifecycle | **WS6 adds a `paused` lifecycle** (§6 Q2): `POST …/lifecycle {action:"pause"\|"resume", rev}`, `active ⇄ paused`; `end`/`abort` also allowed from `paused`; emits `session.updated`. Pause is not a privacy control (off-record is), so writes during pause are still stored. WS7 maps `paused` in `mapSession` and implements `requestPause` | WS6 + WS7 | M |
| G15 | Capture/agent presence | Always `unknown` | Accept for v0. Later WS3 or WS2 could publish presence on the bus | — | L |
| G16 | Wire types | `ws6Wire.ts` copies api-v0 by hand | After I1, import from `@/lib/contracts`. In dev builds, also `safeParse` responses at the `request()` boundary and log drift to the console | WS7 | M |
| G17 | Access token | Not handled | Map 401 `unauthorized` to a banner: "open the access link once on this device" (`/api/access?token=…&next=<page>`) | WS7 | L |
| G18 | `/expert` banner | Uses `source.kind` only | Use the view `source`, so a stub tutor or synthesis shows STUB OUTPUT | WS7 | L |
| G19 | Expert voice → WS6 | `useExpertSession` saves WS3 snapshots via legacy `PUT /api/expert-sessions/:id/snapshot`, which bypasses WS6 exchanges, confirmations and synthesis | Out of scope for WS6/WS7. Raise with WS3: the session reducer should PUT exchanges and confirmations to WS6 (WS3-Q1). Until then the expert → Work Map loop runs on WS6 fixtures/replay (`npm run replay-capture`) | WS3 | M |
| G20 | Config and docs | README add/add conflict; README names `ELEVEN_LABS_KEY` but the code reads `ELEVENLABS_API_KEY`; WS7 has a stray `vitest.config.mts` | Merge the README sections; add `NEXT_PUBLIC_WS7_LIVE_SCREENS` / `NEXT_PUBLIC_WS6_BASE_URL` to `.env.example`; delete the stray vitest config | I1 | L |

Already compatible (verified against the code): the error envelope `{error:{code,message,details}}`; the `BusEvent` shape `{seq,type,session_id,ids,at_utc}` with seq dedupe; `Last-Event-ID` reconnect (the server replays exactly what was missed); `GET /workmap?include=draft`; `GET /events`; `record-state`; lifecycle `end`; `POST …/revoke`; `DELETE …/events/:eid`; `GET …/assessment`.

## 4. Integration steps

### I1: Shared base (now, about 1 hour; prerequisite for everything else)

**Done 2026-10-04.** Worktree `.claude/worktrees/integration-ws6-ws7`, branch `integration-ws6-ws7`, merge `e0dfb0e`.
- Merged: `voice` + `006-ws6-trust-demo` + `ws7-sprint-4`. Only the README conflicted; it now keeps the WS6 guide and adds a WS7 §9.
- Gate results:
  - typecheck clean
  - vitest 109 files / 1346 tests pass
  - `npm run e2e` 45/45 pass (synthesis on its default setting, stub tutor, temp dirs, port 3110)
  - Playwright 33/33 pass (port 3111)
- Not included: the uncommitted WS7 styling WIP in `ws7-sprint-3`. Merge it once committed.

1. Commit the WS7 styling WIP in the `ws7-sprint-3` worktree. Only the WS7 agent or the human does this.
2. Make a branch `integration-ws6-ws7` from `voice` and merge `006-ws6-trust-demo`, then `ws7-sprint-4`. Resolve `web/README.md` by keeping both sections (WS6 run/e2e, WS7 screens/env).
3. Gate: `npm ci && npm run typecheck && npx vitest run && npm run test:e2e` (Playwright, fixtures) **and** `npm run dev -p 3006` + `npm run e2e` (WS6, 45 checks). All four must be green before any gap work.
4. After the human gates (WS6 S2–S4, WS7 S3–S4), merge `integration-ws6-ws7` into `voice`. Both workstreams then branch their next sprint from `voice`.

### I2: Contract lock (WS6; parallel with I3)
- `npm run e2e -- --record web/fixtures/ws6/wire/` writes one real JSON response per route and status that WS7 uses, plus an SSE transcript (`stream.ndjson`).
- The WS6 vitest checks that each recorded file parses with its zod schema.
- **This is the shared fixture set**: if a route changes, the recording changes and both sides' tests see it.

### I3: Frontend live adapter (WS7, against routes that exist today)
- Fix G1–G6, G11–G13, G16, G17 and G18.
- `ws6Mappers.test.ts` runs on the `wire/` recordings from I2 instead of hand-written JSON.
- `/map`, `/summary` and `/practice` can go live with **no new backend work**.

### I4: Backend additions (WS6; parallel with I3)
- Add G7 `GET /api/cases`, G8 `case_id` on expert create, G9 `GET …/review`, G10 `POST …/review-marks` and G14 the `paused` lifecycle.
- Each gets zod schemas in `lib/contracts`, an api-v0 entry (§5 table + D53…), checks in `npm run e2e` and the `--record` set.

### I5: Remaining screens (WS7, after I4)
- `listCases`, `startSession(case_id)`, `getReview`, `submitReviewMark` and `requestPause` in `apiSource`.
- Then `/expert` setup and `/review` go live.

### I6: Live journey gate (both)
- Add a Playwright project `live` that starts one `next dev` with `NEXT_PUBLIC_WS7_LIVE_SCREENS=all`, `WS5_MODULES=stub`, and temporary `KNOWLEDGE_DIR`/`RUNTIME_DIR` seeded from `fixtures/ws6`.
- The journey:
  1. Seed the confirmed knowledge (replay-capture).
  2. `/map` shows the steps.
  3. `/practice`: create a session, draft, review (SSE), get guidance, correct, review again, commit.
  4. `/summary`.
  5. Revoke on `/map`, and see "knowledge changed" in a second tab on `/practice`.
  6. Delete evidence.
- This test plus `npm run e2e` is **the integration gate for every later merge** of either branch.
- When it is green, set `NEXT_PUBLIC_WS7_LIVE_SCREENS=all` in the demo `.env`. Fixtures stay the default for development and tests.

```
I1 ──► I2 ──┬──► I3 (WS7) ──┐
            └──► I4 (WS6) ──┴──► I5 (WS7) ──► I6 (both) ──► demo
```

## 5. Working agreement while parallel

- **Backend sync rule:** before starting a gap, each worktree runs `git merge voice` (or `integration-ws6-ws7` until I1 lands in voice).
- **WS6 change discipline:** any change to `lib/contracts` or a route ships with three things in the same commit: the api-v0 table/decision update, the re-recorded `wire/` fixtures, and a line in the WS6 handoff under "WS7 impact".
- **WS7 boundary:** WS7 asks for backend changes; it does not stub them as new API routes. Until a route exists, the screen stays on fixtures behind `NEXT_PUBLIC_WS7_LIVE_SCREENS`, which is the existing per-screen switch.
- **Ports:** WS6 dev 3006, WS7 dev 3000/3104, Playwright `live` 3110.

## 6. Decisions (human, 2026-10-04)

1. **Merge strategy:** an `integration-ws6-ws7` branch now; it is merged into `voice` after the WS6 S2–S4 and WS7 S3–S4 gates.
2. **Pause:** WS6 adds a `paused` lifecycle state (G14). There is no capability flag.
3. **Review composite:** WS6 builds it in one call, `GET /api/sessions/:sid/review` (G9).
4. **Work Map scope:** the one shared global map for the demo. The session-scoped view is used only inside `/review`.
5. **Expert voice → WS6 (G19):** raised with WS3 now (`notes/ws6-sprints/request-ws3-voice-to-ws6.md`).
