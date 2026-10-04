# Terminal C — Demo readiness / production-mode smoke test (parallel)

Paste everything below the line into a fresh Claude Code session started in the repo root.

---

You are Terminal C of three parallel agents. Terminal A is deploying `web/` to Cloudflare Containers. **Your job is to make sure the app works in production mode** (`next build` + `next start`) before A's deploy goes live, and to fix only real blockers.

## Context
- The repo is `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, and `voice` is the integration branch. You work **in the main checkout on `voice`**.
- Next.js 16 app in `web/`: UI + `app/api/*`. Filesystem data (`KNOWLEDGE_DIR`, `RUNTIME_DIR`, `CASES_DIR` falls back to `fixtures/ws6/cases`), SSE at `/api/sessions/[sid]/stream`, `/api/*` gated by `BACKEND_ACCESS_TOKEN` via `web/proxy.ts`.
- Demo navigation notes: `notes/ws7-demo-navigation.md`. API reference: `notes/ws6-api-v0.md`. README §2/§5 cover running and access.
- In the deployed container, data starts empty except for bundled `fixtures/`. Check what the demo needs to exist (cases, seeded sessions, knowledge) and whether a fresh `/data` is enough.

## Parallel agents — do not collide
- **Don't edit** `web/next.config.ts`, `web/Dockerfile`, `web/.dockerignore`, `web/wrangler.jsonc` or `web/cf/*` (Terminal A owns those, in worktree `deploy-cf`).
- Don't touch worktree `ws-cf-storage` (Terminal B).
- Commit fixes as **small, separate commits on `voice`**, one fix per commit. Terminal A will merge `voice` before its final deploy, so tell the user when you commit something A needs.

## Steps
1. `cd web && npm ci && npm run typecheck && npm test`. Note any failures, but don't go down rabbit holes on tests unrelated to the demo flow.
2. `npm run build`. Fix any production build errors with minimal changes.
3. Simulate the container's empty data dirs: `KNOWLEDGE_DIR=/tmp/ti-demo/knowledge RUNTIME_DIR=/tmp/ti-demo/runtime npm start` (use a scratch dir), plus the vars from `web/.env`.
4. Click through the whole demo flow in a browser (use the browser skill/tool if available, otherwise curl the API in order): health, access token, cases list, start expert session, SSE stream, conversation token, evidence upload, synthesis job, review/newcomer/tutor screens. Record each step as OK/FAIL in `notes/deploy/demo-smoke.md`.
5. Fix real blockers only (crashes, 500s, missing seed data on a fresh data dir, hard-coded localhost URLs, dev-only code paths). For each fix: a minimal diff, `npm test` still passing, then commit on voice.
6. If the demo needs seed data that a fresh container won't have, propose (and, if simple, implement) a seed step that doesn't touch Terminal A's files. For example, the app lazily creating dirs, or a `fixtures/`-based default. Report it clearly so A can wire it into the image.
7. Write a short **demo script** to `notes/deploy/demo-script.md`: the click path for the showcase, what to say, and known rough edges to avoid.
8. Report: smoke results, the commits you made, and anything Terminal A must pick up.

## Timebox
~40 minutes. Prioritize the main demo path over edge cases.
