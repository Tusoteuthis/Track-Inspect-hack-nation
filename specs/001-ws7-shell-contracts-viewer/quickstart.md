# Quickstart / validation: WS7 Sprint 0

```bash
cd web
npm install
npm run typecheck
npm test              # vitest: geometry, viewer states, banner, data source
npm run test:e2e      # Playwright: every route loads; FIXTURE banner on fixture screens
npm run dev           # http://localhost:3000
```

Manual checks:

1. Open `/` and use the nav to reach `/expert`, `/review`, `/map`, `/practice`, `/summary` and `/dev`. Each loads, and the fixture screens show the banner.
2. On `/dev`, the voice prototype (flow picker, Start orb, contextual update) works as before.
3. On `/dev/evidence`, check the resolved, ambiguous, unresolved and frame-mismatch cards plus a focus/full toggle and Inspect. Resize the window and check the outline stays aligned. View it on the demo monitor through the glasses (human gate).

Evaluator-field check (must print nothing):

```bash
grep -riE "expected_decision|acceptable_explanation|common_wrong|scoring|answer_key" web/fixtures web/public/fixtures
```
