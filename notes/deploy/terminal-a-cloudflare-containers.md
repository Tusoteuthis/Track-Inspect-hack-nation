# Terminal A — Deploy to Cloudflare Containers (critical path)

Paste everything below the line into a fresh Claude Code session started in the repo root.

---

You are Terminal A of three parallel agents. Your job is to **deploy the Next.js app in `web/` to Cloudflare Containers in under 45 minutes**, with **no changes to app code** (only build/deploy config). Speed matters more than polish.

## Context
- The repo is `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, and `voice` is the integration branch.
- One Next.js 16 app in `web/` serves both the UI and the API (`app/api/*`).
- The backend stores data on the local filesystem (`lib/backend/config.ts`: `KNOWLEDGE_DIR`, `RUNTIME_DIR`, `CASES_DIR` falls back to `fixtures/ws6/cases`). It keeps in-memory locks and jobs, and it serves SSE at `/api/sessions/[sid]/stream`. So it **must run as ONE long-lived Node process**, which is why we use Containers and not plain Workers.
- `web/proxy.ts` gates `/api/*` with `BACKEND_ACCESS_TOKEN` (see `lib/backend/access.ts`).
- Data resets when the container restarts. That is accepted for the demo.

## Parallel agents — do not collide
- **Work in a new git worktree** at `.claude/worktrees/deploy-cf`, on a new branch `deploy-cf` branched from `voice`. Install deps there with `cd web && npm ci`.
- Terminal B works in worktree `ws-cf-storage` (storage port). Don't touch it.
- Terminal C commits small production-blocker fixes directly to `voice` in the main checkout. Before your final deploy, run `git merge voice` into `deploy-cf` to pick up C's fixes.
- You own these files: `web/next.config.ts`, `web/Dockerfile`, `web/.dockerignore`, `web/wrangler.jsonc`, `web/cf/worker.ts`, and the devDependencies you add.

## Credentials
Cloudflare credentials are in `web/.env` of the main checkout (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; account is on Workers Paid, workers.dev subdomain `matthiass1`). Export them before running wrangler (`set -a; . <main-checkout>/web/.env; set +a`). Never print secret values. Copy `web/.env` into your worktree's `web/` (it's gitignored, so the worktree won't have it).

## Steps
1. **Read the current docs first** for `@cloudflare/containers` and wrangler container config (developers.cloudflare.com/containers). APIs are new and change, so don't write from memory.
2. `web/next.config.ts`: add `output: "standalone"` and keep the existing `turbopack.root`.
3. `web/Dockerfile`, multi-stage, `node:22-slim`:
   - deps/build: `npm ci`, then `npm run build`
   - runtime: copy `.next/standalone` → `/app`, `.next/static` → `/app/.next/static`, `public` → `/app/public`, `fixtures` → `/app/fixtures`
   - `WORKDIR /app`, `ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 KNOWLEDGE_DIR=/data/knowledge RUNTIME_DIR=/data/runtime`, `RUN mkdir -p /data`, `EXPOSE 8080`, `CMD ["node","server.js"]`
   - Config resolves relative paths against `process.cwd()`. Check that the `CASES_DIR` fallback (`fixtures/ws6/cases`) resolves inside `/app`, and set `CASES_DIR=/app/fixtures/ws6/cases` explicitly if needed.
   - The image must target **linux/amd64** (Cloudflare requirement). Use `--platform=linux/amd64` on Apple Silicon.
4. `web/.dockerignore`: node_modules, .next, .env*, test-results, e2e, .runtime, coverage.
5. **Test locally**: `docker build --platform=linux/amd64 -t ti web && docker run --rm -p 8080:8080 --env-file web/.env ti`, then `curl -i localhost:8080/api/health` and open the UI in the browser. Fix any build problems. If a production build error comes from app code, make the smallest possible fix and note it.
6. Install `wrangler` and `@cloudflare/containers` as devDependencies in `web/`.
7. `web/cf/worker.ts`: a `Container` subclass `App` with `defaultPort = 8080` and `sleepAfter = "2h"`, passing secrets to the container via `envVars` built from the Worker's `env` (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID_EXPERT, ELEVENLABS_AGENT_ID_TUTOR, BACKEND_ACCESS_TOKEN, ANTHROPIC_API_KEY if set). The default fetch handler forwards **every** request to **one** named instance (`getContainer(env.APP, "main")`) so all traffic hits the same process. Make sure streaming responses (SSE) pass through without buffering.
8. `web/wrangler.jsonc`: name `track-inspect`, `main: "cf/worker.ts"`, a current `compatibility_date`, `containers: [{ class_name: "App", image: "./Dockerfile", max_instances: 1 }]`, Durable Object binding `APP` → `App`, migration `new_sqlite_classes: ["App"]`. Pick an instance type with enough memory for Next.js (≥1 GiB if available).
9. Secrets: `cd web && npx wrangler secret put <NAME>` for each one. The user will paste the values when prompted. Ask the user to do this step if you can't run it interactively, and tell them the exact commands.
10. Deploy: `cd web && npx wrangler deploy`. The first container rollout can take a few minutes, so poll the URL.
11. **Verify on the workers.dev URL**:
    - `curl -i https://<name>.<subdomain>.workers.dev/api/health` returns 200
    - In the browser: the UI loads, the access token works (cookie), an expert session can be started, SSE events arrive live, and `/api/conversation-token` returns a token
    - Report the URL and anything that failed
12. Add a short "Deploy (Cloudflare Containers)" section to `README.md` (commands, secrets, data-reset caveat). Commit on `deploy-cf` with a clear message. **Don't merge into voice and don't push**. The user decides.

## Stop conditions
- If the account/plan blocks Containers (e.g. not on Workers Paid), stop and report. Don't switch hosts.
- If you're stuck for more than 10 minutes on Containers specifics, report and suggest the fallback: `npm run build && npm start` + `cloudflared tunnel --url http://localhost:3000`.
