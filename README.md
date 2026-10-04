# TrackInspect

- `ios/` — native iOS inspection app, Meta DAT, Mentra-compatible glasses and ElevenLabs voice.
- `web/` — web application.
- `agents/` — agent configuration.
- `notes/` — project notes.

## Repository locations

- GitHub: https://github.com/Tusoteuthis/Track-Inspect-hack-nation
- Gitea (private): https://git-dev.obachan.dev/budelius/Track-Inspect-hack-nation

Both remotes receive the same commits; no automatic server-side mirroring is configured:

```sh
git push origin main
git push gitea main
```

## iOS agent presets

Settings provides Expert and Tutor public-agent presets. Expert is the default when no saved agent preference exists; existing/custom IDs are preserved. Selection does not start audio or bypass cloud consent. No ElevenLabs API key belongs in the iOS app.

## Deploy (Cloudflare Containers)

`web/` runs as one long-lived Node process in a Cloudflare Container. A Worker (`web/cf/worker.ts`) routes every request to a single named instance, because locks, jobs and SSE live in process memory. Config: `web/wrangler.jsonc`, `web/Dockerfile` (Next `output: "standalone"`, linux/amd64, `standard-1` instance).

Live URL: https://track-inspect.matthiass1.workers.dev

```bash
cd web
set -a; . ./.env; set +a          # CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (Workers Paid account)
npx wrangler deploy               # builds + pushes the image (Docker must be running), deploys the Worker

# Secrets (once, or when they change); the Worker forwards them into the container env
for v in ELEVENLABS_API_KEY ELEVENLABS_AGENT_ID_EXPERT ELEVENLABS_AGENT_ID_TUTOR BACKEND_ACCESS_TOKEN; do
  printf %s "${!v}" | npx wrangler secret put "$v"
done                              # optional: ANTHROPIC_API_KEY

# Restart the container (picks up new secrets, wipes data)
curl -X POST -H "Authorization: Bearer $BACKEND_ACCESS_TOKEN" https://track-inspect.matthiass1.workers.dev/__restart
```

Open `/api/access?token=<BACKEND_ACCESS_TOKEN>` once in the browser to set the access cookie.

**Data is ephemeral.** Knowledge, sessions and runtime files live under `/data` inside the container. They reset whenever the container restarts: on a redeploy, on `/__restart`, or after 2 h without traffic (`sleepAfter`). Cases come from the bundled `fixtures/ws6/cases`.
