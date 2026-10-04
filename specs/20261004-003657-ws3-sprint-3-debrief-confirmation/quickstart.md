# Quickstart / validation

```bash
cd web
npm run typecheck && npx vitest run         # includes debrief-run.test.ts (end-to-end fixture session)
npm run sync-agents -- --agent expert
npm run probe -- expert --runs 5            # 15 cases, each ≥ 4/5
npm run dev -- -p 3103                      # http://localhost:3103/dev — human gate in the handoff
```

Expected: the fixture e2e test writes a session folder that has `revisions/rev-1.*`, `revisions/rev-2.*`, `confirmations.json` (the final entry is `confirmed` on rev-2) and `knowledge-draft.md`, with image and verbatim-quote evidence for every step.
