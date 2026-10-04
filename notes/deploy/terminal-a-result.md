# Terminal A result — Cloudflare Containers deploy (2026-10-04)

**Live:** https://track-inspect.matthiass1.workers.dev. The commands, secrets and data-reset caveat are in the root README under "Deploy (Cloudflare Containers)".

## What was built
- `web/Dockerfile`: multi-stage `node:22-slim`. It runs `npm ci && npm run build`, then copies the Next standalone output, static files, `public/` and `fixtures/` into `/app`. It runs `node server.js` on port 8080. `KNOWLEDGE_DIR=/data/knowledge`, `RUNTIME_DIR=/data/runtime`, `CASES_DIR=/app/fixtures/ws6/cases`.
- `web/next.config.ts`: `output: "standalone"`. `web/tsconfig.json` excludes `cf/`.
- `web/wrangler.jsonc`: Worker `track-inspect` with one `App` container (`standard-1`: ½ vCPU, 4 GiB) and `max_instances: 1`. The Durable Object binding `APP` uses a sqlite migration `v1`.
- `web/cf/worker.ts`:
  - `App extends Container` with `defaultPort` 8080 and `sleepAfter` "2h". It forwards the secrets as container env vars.
  - Every request goes to `getContainer(env.APP, "main")`, and the Response is passed through as-is, so SSE streams through.
  - `POST /__restart` with `Authorization: Bearer <BACKEND_ACCESS_TOKEN>` destroys the container and aborts the DO. The next request boots fresh with the current secrets and empty data.
- No app code changes.

## Verified (production, curl)
- `/api/health` returns 200 and reports all ElevenLabs config and `access_token_required: true`. `/` returns 200.
- `/api/*` returns 401 without the token. `/api/access?token=…` sets the cookie.
- `POST /api/sessions {"role":"expert"}` creates a session, and its `lifecycle start` event arrives live on `/api/sessions/:sid/stream`.
- `/api/conversation-token?flow=expert` returns a token.
- `/__restart` without the token returns 403.
- Not done: a manual click-through in a browser (mic/voice).

## Gotchas
- **Secrets are only read when the container boots.** The first container started before `wrangler secret put` ran and came up without env. After changing secrets, call `/__restart`. `destroy()` alone isn't enough, because the DO keeps its old env.
- **Data is ephemeral** (`/data` in the container). It resets on redeploy, on `/__restart`, and after 2 h idle. Terminal B's R2 port is what would fix that.
- `npx wrangler deploy` needs Docker running locally (it builds the linux/amd64 image).
- `ANTHROPIC_API_KEY` isn't set as a secret (it's not in `web/.env`). Add it with `wrangler secret put` and then `/__restart`.
