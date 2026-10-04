# NSPCT web app

Next.js 16 / React 19 / strict TypeScript. One app hosts every WS7 screen, the WS3 voice flows and (once merged) the WS6 API routes.

## Running the web app (WS7)

### Startup
```bash
cd web
npm install
npm run dev                 # http://localhost:3000 (use -- -p <port> for another port)
npm run build && npm start  # production build
```
Demo path and fallbacks: `notes/ws7-demo-navigation.md`.

### Verification
```bash
npm run typecheck
npx vitest run
npx playwright test         # starts its own dev server on PW_PORT (default 3100); screenshots → test-results/
npm run build               # then grep .next/static for evaluator-only field names (must be empty):
grep -rliE 'expected[_ ]?(decision|answer)|acceptable[_ ]?explanation|common[_ ]?wrong|scoring|answer[_ ]?key|rubric' .next/static
```

### Environment variables (`web/.env`)
| Variable | Used by | Notes |
|---|---|---|
| `ELEVEN_LABS_KEY` (+ the agent ids used by `/api/conversation-token`) | Voice apprentice (`/expert`), tutor (`/practice`) | Server-only. The browser only receives short-lived tokens. If the key in `web/.env` is stale, the repo-root `.env` has a working one. |
| `NEXT_PUBLIC_WS7_LIVE_SCREENS` | Data source per screen | Comma list of `expert,review,map,practice,summary`, or `all`. Unset means every screen uses fixtures. |
| `NEXT_PUBLIC_WS6_BASE_URL` | WS6 API base | Default `""` (same origin, i.e. WS6 routes in this app). Set it, for example, to `http://<laptop-ip>:3006` only if WS6 runs separately and allows the origin. |

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild or restart after changing them.

### Live vs fixture screens
Screens choose their source in `components/shell/useScreenSource.ts`: either `lib/data/apiSource.ts` (WS6) or `lib/data/fixtureSource.ts`. Fixture and stub data always show a banner.

| Screen | Status in this branch | Can it go live once WS6 is merged? |
|---|---|---|
| `/expert`, `/expert/display` | fixture | Partly. Session, start, off-record, stop and pointing events have WS6 S1 routes. The case list (`listCases`) and pause have **no WS6 route**, so the setup would show its error state. Keep it on fixture until WS6 serves cases. |
| `/review` | fixture | No. WS6 has no review view (current + previous revision, open questions, confirmations) and no review-mark route. |
| `/map` | fixture | Yes. `GET /api/workmap?include=draft` + SSE (WS6 S2). Revoke and delete need WS6 S4. |
| `/practice` | fixture | No. Needs WS6 S3 (cases, learner draft, evaluations, commit). |
| `/summary` | fixture | No. Needs WS6 S3 (assessment) and WS5 S4 (`content.decisions[]`). |

Fixture URL settings (fixture screens only): `?fixture_latency=<ms>`, `?fixture_replay_ms=<ms>` and `?fixture_fail=review|commit|offrecord|pause|stop|revoke|delete`.
