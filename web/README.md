# Track Inspect — web app and shared backend (WS6)

One Next.js process serves the web UI (WS7) and the shared backend API (WS6) that the iPhone app (WS2), the voice agent (WS3) and the knowledge/tutor modules (WS5) plug into. Data lives on the local filesystem, live updates use SSE, and the modules run in-process. There is no database, queue or cloud dependency.

- API contract: [`../notes/ws6-api-v0.md`](../notes/ws6-api-v0.md)
- Failure and recovery: [`../notes/ws6-failure-recovery.md`](../notes/ws6-failure-recovery.md)

## 1. Prerequisites

- Node.js 20 or newer (tested with Node 22) and npm.
- macOS or Linux. The demo laptop and the iPhone must be on the same Wi-Fi for the LAN setup.
- Optional:
  - an ElevenLabs API key and agent IDs (voice);
  - an Anthropic API key (the real WS5 tutor judge).

## 2. Install and configure

```bash
cd web
npm install
cp .env.example .env      # then fill in what you have; everything is optional for the fixture demo
```

`.env` keys. All of them are optional; the defaults are in brackets.

| Key | What it does |
|---|---|
| `ELEVENLABS_API_KEY` | Server-side only. `/api/conversation-token` uses it to mint short-lived voice tokens. Never sent to clients. |
| `ELEVENLABS_AGENT_ID_EXPERT`, `ELEVENLABS_AGENT_ID_TUTOR` | ElevenLabs agents for the expert and tutor flows. |
| `KNOWLEDGE_DIR` [`../knowledge`] | Sessions, images, knowledge entries (Markdown), confirmations, learner records, assessments, tombstones. |
| `RUNTIME_DIR` [`.runtime`] | Diagnostics log, job state and idempotency records. Never served. |
| `EVALUATOR_DIR` [`$RUNTIME_DIR/evaluator`] | WS4's evaluator-only answer key. **Never** served, never handed to a module; every served path refuses it. |
| `CASES_DIR` [`../cases/learner` if it exists, else `fixtures/ws6/cases`] | Learner-visible cases (`<case_id>/case.json` + trace image). The fallback cases are labelled `fixture`. |
| `WS5_MODULES` [unset] | `stub` = stub synthesis. `real` = real WS5 tutor evaluator (needs `ANTHROPIC_API_KEY`). Unset = real WS5 synthesis + stub tutor. See §6. |
| `ANTHROPIC_API_KEY` | Only for `WS5_MODULES=real` (the tutor's judge). |
| `BACKEND_ACCESS_TOKEN` [unset] | Turns on the demo access boundary (§5). |
| `ASSET_MAX_BYTES` [15 MiB] | Per-file upload limit for evidence images. |

`.env` is gitignored. Never commit keys.

## 3. Start

**Local**, the usual way. WS6 uses port 3006 by convention:

```bash
npm run dev -- -p 3006
curl -s localhost:3006/api/health | jq     # ok: true, modules, elevenlabs (booleans), failing_components
```

**LAN**, so the iPhone (WS2) can reach the laptop:

```bash
npm run dev -- -p 3006 -H 0.0.0.0
ipconfig getifaddr en0          # macOS: the laptop's Wi-Fi IP, e.g. 192.168.1.20 (Linux: hostname -I)
```

The iPhone app then uses `http://<laptop-ip>:3006` as its base URL. Check it from the phone's browser: `http://<laptop-ip>:3006/api/health`. If that does not load, see "iPhone can't reach the laptop" in the failure notes.

**Production-like:** `npm run build && npm start -- -p 3006` (add `-H 0.0.0.0` for LAN).

Useful pages:
- `/` — app shell;
- `/practice` — WS7 newcomer practice;
- `/diagnostics` — WS6 dev tool: health, per-component last error, the ID chain of one session.

## 4. Check that it works

With the server running:

```bash
npm run typecheck && npx vitest run           # unit + route tests (temp dirs, no server needed)
npm run replay-capture                         # replays a fixture expert capture twice (idempotency)
npm run e2e -- --runtime-dir .runtime          # the whole flow; prints a pass/fail table; exit 1 on failure
```

`npm run e2e` options:
- `--base http://<ip>:3006`;
- `--token <BACKEND_ACCESS_TOKEN>` (also read from the env);
- `--runtime-dir <RUNTIME_DIR the server uses>`, so the diag-file content scan can find the files.
- `--record fixtures/ws6/wire` rewrites the WS7 wire recordings, but only if every check passes. Use it against a fresh server whenever a route or a schema in `lib/contracts` changes, and commit the recordings together with the change (`lib/contracts/wire-recordings.test.ts` checks them).

It runs on fresh or existing data, and every record it writes is labelled `fixture`.

For a completely fresh run:

```bash
KNOWLEDGE_DIR=.runtime/e2e/knowledge RUNTIME_DIR=.runtime/e2e/runtime npm run dev -- -p 3006
npm run e2e -- --runtime-dir .runtime/e2e/runtime    # ALL PASS (52 checks, C1–C9)
```

## 5. Access boundary (what it protects and what it does not)

Set `BACKEND_ACCESS_TOKEN` to a long random string (`openssl rand -hex 24`) and restart.

**Protected:**
- Every `/api/*` route except `/api/health` and `/api/access` answers `401 unauthorized` unless the request carries `Authorization: Bearer <token>` (the iPhone app, scripts, curl) or the `ws6_access` cookie.
- Browsers get the cookie once from `http://<laptop-ip>:3006/api/access?token=<token>&next=/practice`. The cookie is HttpOnly and SameSite=Strict, and holds a hash of the token, not the token itself.
- EventSource (SSE) works with the cookie.

**Always true, token or not:**
- The ElevenLabs and Anthropic keys never leave the server; clients only get short-lived, session-scoped voice tokens.
- Evaluator material is not reachable through any route.
- Logs and diagnostics hold IDs, timings and error codes only.

**Not protected (by design, for a LAN demo):**
- It is **one shared secret**: no users, no roles, no expiry, no revocation except changing the token and restarting.
- **No TLS:** on the LAN, anyone who can sniff the Wi-Fi can read the token, the cookie and all traffic.
- The UI pages themselves (`/`, `/practice`, …) are not gated. They show nothing without the API.
- Not suitable for the public internet. Deploying beyond the LAN is **not** set up and needs explicit authorization.

## 6. Stubs and real modules

`/api/health.modules` always shows what is active (`source: "stub" | "live"`). Every stub output says so in the content too.

| Module | Default | Switch |
|---|---|---|
| WS5 synthesis | real `ws5-synthesis` | `WS5_MODULES=stub` → `ws6-stub-synthesis` (verbatim lines only) |
| WS5 tutor evaluator | `ws6-stub-tutor` (decision `FIXTURE_WRONG` → intervene, `FIXTURE_UNCERTAIN` → uncertain, else ok; never judges content) | `WS5_MODULES=real` + `ANTHROPIC_API_KEY` → `ws5-tutor` |
| Assessment | `ws6-stub-assessment` (facts only) | until WS5 ships a module: replace `storeAssessmentLocked` in `lib/backend/assessment.ts` |
| Learner cases | `fixtures/ws6/cases` (fixture) | put WS4 cases in `<repo>/cases/learner/` or set `CASES_DIR` |

The adapters live in `lib/backend/modules.ts`. Restart the server after changing `WS5_MODULES`.

**Fixture knowledge is never used silently.** A newcomer session pins only live, confirmed, current knowledge, unless it is created with `POST /api/sessions?allow_fixture_knowledge=1`. The session then records `knowledge_fixture_allowed: true`.

## 7. Reset data

Stop the server first.

```bash
rm -rf ../knowledge/sessions ../knowledge/images ../knowledge/entries ../knowledge/workflow.md \
       ../knowledge/confirmations ../knowledge/learner ../knowledge/assessments ../knowledge/tombstones \
       .runtime/jobs .runtime/idempotency .runtime/diag
```

Or point `KNOWLEDGE_DIR`/`RUNTIME_DIR` at a new directory, which leaves the old data untouched.

Leave `EVALUATOR_DIR` alone unless you mean to remove the answer key.

**Deleting single records** goes through the API, so the cascade runs: dependent knowledge is revoked and redacted, evaluations are marked stale, and tombstones block late retries.

```bash
curl -X DELETE localhost:3006/api/sessions/<sid>/exchanges/<xid>
curl -X DELETE localhost:3006/api/sessions/<sid>/events/<eid>      # also its image and the answers about it
curl -X DELETE localhost:3006/api/assets/<aid>
curl -X DELETE localhost:3006/api/sessions/<sid>                   # everything from that session
curl -X POST -H 'content-type: application/json' -d '{"reason":"…"}' localhost:3006/api/knowledge/entries/<entry_id>/revoke
```

"That last part was off the record" purges everything captured since `since_utc` and drops later retries:

```bash
curl -X POST -H 'content-type: application/json' localhost:3006/api/sessions/<sid>/record-state -d '{"state":"off_record","since_utc":"<iso>"}'
```

## 8. Layout

```
app/api/…            thin route handlers (parse → lib/backend → error envelope)
app/diagnostics/     WS6 diagnostics page (dev tool)
lib/contracts/       versioned transport types + zod schemas (ws6.v0)
lib/backend/         server-only: store, locks, bus/SSE, sessions, assets, events, exchanges, synthesis,
                     knowledge, confirmations, Work Map, newcomer/learner/commit policy, cascade, access, diagnostics
lib/knowledge/       WS5 modules (synthesis, eligibility, tutor evaluation) hosted in-process
proxy.ts             the access boundary for /api/*
scripts/             replay-capture, e2e-integration, WS3 agent tooling
fixtures/ws6/        labelled fixtures (source: "fixture")
```
