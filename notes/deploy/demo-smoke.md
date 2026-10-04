# Demo smoke test: production mode on empty data dirs

**Date:** 2026-10-04 · **Branch:** `voice` @ `811309f` · **By:** Terminal C

## Setup
- `cd web && npm ci && npm run typecheck && npm test && npm run build`
- `KNOWLEDGE_DIR=<scratch>/knowledge RUNTIME_DIR=<scratch>/runtime PORT=3100 npm start`. The env comes from `web/.env`: the ElevenLabs key, both agent IDs and `BACKEND_ACCESS_TOKEN`.
- Both data dirs **did not exist** at start, the same as a fresh container `/data`. `CASES_DIR` was unset, so it fell back to `fixtures/ws6/cases`.
- Local Node is v26; the container uses Node 22.

## Results

### Build and tests
| Step | Result | Notes |
|---|---|---|
| `npm ci` | OK | |
| `npm run typecheck` | OK | |
| `npm test` (vitest) | OK | 140 files, 1990 tests |
| `npm run build` | OK | no warnings or errors; every page is static, every API route is dynamic |

### Access gate
| Step | Result | Notes |
|---|---|---|
| `GET /api/health` | OK | 200; both dirs writable (it creates them lazily); synthesis is live, tutor and assessment are stubs; ElevenLabs key and both agents configured |
| `/api/*` without a token | OK | 401 `unauthorized`, as intended |
| `GET /api/access?token=WRONG` | OK | 401 |
| `GET /api/access?token=…&next=/` | OK | 303 to `Location: /` (**relative**, so it is safe behind the Worker); cookie `ws6_access` is HttpOnly, SameSite=Strict |

### Pages and browser tests
| Step | Result | Notes |
|---|---|---|
| Pages `/ /expert /expert/display /review /map /practice /summary /diagnostics` | OK | all 200 |
| Playwright suite against the prod server, authenticated with the cookie | OK | 34/34 pass, including the full demo journey (entry → expert → review → map → practice → summary) and the monitor video hold |

### Voice and expert-session routes (the server calls the fixture UI makes)
| Step | Result | Notes |
|---|---|---|
| `GET /api/conversation-token?flow=expert` | OK | 200 token. **401 without the cookie** |
| `GET /api/conversation-token?flow=tutor` | OK | 200 token |
| `PUT /api/expert-sessions/:id/snapshot` | OK | 200; writes `knowledge/sessions/<id>/*` into an empty dir |
| `POST /api/expert-sessions/:id/demo-evidence` | OK | 200 |
| `POST /api/expert-sessions/:id/elevenlabs-deletion` | OK | 409 while the session is running, as designed |

### Backend API flow (not on the demo path; screens are fixture-backed)
| Step | Result | Notes |
|---|---|---|
| `GET /api/cases`, `/api/workmap`, `/api/knowledge/entries`, `/api/diagnostics` | OK | cases come from the fixtures (3); the work map and entries are empty and return 200, not 404 |
| `POST /api/sessions` (expert), lifecycle start, record-state off/on | OK | 201/200 |
| SSE `GET /api/sessions/:sid/stream` | OK | events arrive live, with `id:`/`event:` framing and no buffering seen locally |
| Full backend E2E `npm run e2e -- --base http://localhost:3100` | OK | **ALL PASS (52 checks)**: evidence upload, synthesis job, confirmation, Work Map images, newcomer evaluation/commit, revocation, diagnostics |
| Server log | OK | no errors and no ENOENT |

## Fixes made
None. No production blocker was found, so there are no code commits from Terminal C.

## Findings for Terminal A
1. **No seed step needed.** Every demo screen renders fixture data compiled into the client bundle. The backend creates `KNOWLEDGE_DIR`/`RUNTIME_DIR` lazily, and missing dirs read as empty. An empty `/data` plus `fixtures/` at `/app/fixtures` is enough.
2. **Start from `/app`, where `fixtures/` lives.** Paths resolve against `process.cwd()`. The `CASES_DIR` fallback is `fixtures/ws6/cases`, relative to that directory. Setting `CASES_DIR=/app/fixtures/ws6/cases` explicitly is harmless.
3. **`NEXT_PUBLIC_WS7_LIVE_SCREENS` is inlined at `next build` time.** Leave it **unset** in the image. Live screens on an empty `/data` would show empty states, while the fixture screens are what the demo uses.
4. **Access token: the browser must visit `/api/access?token=…&next=/` once.** Without that, the voice token returns 401 and the expert and tutor voice won't start. The screens still render, because only `/api/*` is gated. The cookie has no `Secure` flag, which is fine over https.
5. **Runtime env the container needs:** `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID_EXPERT`, `ELEVENLABS_AGENT_ID_TUTOR`, `BACKEND_ACCESS_TOKEN`. `ANTHROPIC_API_KEY` is **not** needed: the tutor is a stub unless `WS5_MODULES=real`.
6. **What I could not verify locally:** SSE through the Worker/Container proxy (buffering) and microphone permission on the workers.dev origin. Check both on the deployed URL.
7. `/dev` and `/dev/evidence` ship in the build without a guard. They are harmless; just don't navigate there during the demo.
