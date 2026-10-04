# Quickstart: validate Sprint 1

```bash
cd web
npm ci                 # if node_modules is missing
npm run typecheck
npx vitest run
npx playwright test    # port 3100; screenshots → web/test-results/
npm run dev            # http://localhost:3000
```

Manual checks:
1. `/map`: Tab into the process list, use ↓/↑/Home/End, press Enter. The URL gains `?entry=…&rev=…`; the panel shows the region, the expert's words and the apprentice summary in separate boxes.
2. Open the copied URL in a new tab: the same item is selected.
3. `/review`: use "Fixture playback → Next step" three times. Expect: correction notice on Revision 1 → "Revision 2" with "Changed" markers and old → new → "Expert confirmed Revision 2 in the spoken teach-back".
4. Select a step, press "Mark step for correction": pending, then acknowledged. Tick "Simulate failures" and retry: failure shown.
