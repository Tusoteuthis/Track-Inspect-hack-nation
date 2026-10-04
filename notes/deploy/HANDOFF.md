# Deploy workstream handoff (Terminals A, B, C), 2026-10-04

**Start here** if you're picking up deploy, demo or storage work. All three parallel terminals are finished and closed. Their work is on `voice`; the user merges `voice` into `main` themselves.

## State
| | |
|---|---|
| Branch | `voice` (pushed). No deploy worktrees or branches are left. |
| Live app | https://track-inspect.matthiass1.workers.dev (Cloudflare Containers: one Next.js process behind a Worker) |
| Deployed code | Terminal A's build, which came **before** Terminal B's storage-port merge (`80b78ab`). Behavior should be the same, because B's default is `STORAGE_BACKEND=fs`. Redeploy to match `voice` exactly. |
| Verified on merged `voice` | typecheck OK · vitest 141 files / 2005 tests · `next build` OK · prod smoke on empty data dirs OK · backend E2E `npm run e2e` 52/52 |
| Verified live | API smoke, SSE through the Worker unbuffered, Playwright 34/34 (full demo journey) |
| **Not verified** | microphone and real ElevenLabs voice in a browser on the live URL (needs a human) |

## Docs in this folder
| File | What it is |
|---|---|
| `terminal-{a,b,c}-*.md` | The original briefs for each parallel terminal |
| `terminal-a-result.md` | Deploy: what was built, verification, gotchas (secrets, `/__restart`) |
| `storage-port-status.md`, `storage-port-inventory.md` | Terminal B: the BlobStore/R2 port, the plan for a plain-Workers deploy, risks, estimate |
| `demo-smoke.md` | Terminal C: prod-mode smoke results (local and live), plus findings for deploy |
| `demo-script.md` | Presenter click path, what to say, rough edges |

Deploy commands, secrets and the data-reset caveat are in `README.md` → "Deploy (Cloudflare Containers)".

## Open points / known issues (for the next agent)
1. **Redeploy from `voice`** (`cd web && npx wrangler deploy`; Docker must be running) so the live app includes Terminal B's storage refactor. Then rerun the live checks in `demo-smoke.md`.
2. **Voice not tested live.** Rehearse it:
   - open `<URL>/api/access?token=<BACKEND_ACCESS_TOKEN>&next=/expert`
   - allow the mic, then start the voice apprentice
   - try the tutor on `/practice`

   Without the access cookie, voice fails with 401 even though the screens load.
3. **Data is ephemeral.** `/data` in the container resets on redeploy, on `/__restart`, and after 2 h idle (`sleepAfter`). The live instance holds test sessions from the smoke runs; `POST /__restart` (bearer token) wipes them.
4. **Secrets are read only at container boot.** After `wrangler secret put`, call `/__restart`. `ANTHROPIC_API_KEY` is not set. It's only needed for `WS5_MODULES=real`; the default tutor is a stub.
5. **Every demo screen is FIXTURE data** (compiled in; `NEXT_PUBLIC_WS7_LIVE_SCREENS` is unset at build). Making screens live is a build-time switch, and they would show empty states on a fresh `/data` unless a seed step is added.
6. **`/dev` and `/dev/evidence` ship unguarded.** Harmless, but consider gating them behind an env flag.
7. **Persistence and a plain-Workers deploy** are not done. Terminal B ported storage to a `BlobStore` interface: `fs` is the default, and `r2` is only tested against a fake bucket. `durable.ts` is an unwired sketch. The remaining steps (OpenNext adapter, bindings, `SessionDurableObject` for SSE/synthesis, data migration, diag sink) are in `storage-port-status.md`, estimated at ~2.5–3 dev-days.
8. **Smaller items:**
   - Local dev runs Node 26, the container runs Node 22. No issue seen.
   - The `ws6_access` cookie has no `Secure` flag. Fine over https; just note it.

## Repo media
`data/` holds an iOS TrackInspect app screenshot, the NSPCT logo, the app icon and a short WhatsApp video (4 MB). They are committed as project assets and nothing references them yet.
