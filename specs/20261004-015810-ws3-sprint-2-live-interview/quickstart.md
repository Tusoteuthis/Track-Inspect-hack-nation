# Quickstart — validating WS3 Sprint 2

Worktree: `.claude/worktrees/ws03-sprint-2` (`web/.env` has the key + expert agent id).

## Automated

```bash
cd web
npm run typecheck
npx vitest run                         # topics, speech, timing, scenario, session, contracts, store
npm run sync-agents -- --agent expert  # prompt, skip_turn description, turn_timeout 15
npm run probe -- expert --runs 5       # 10 cases; each must be ≥ 4/5
```

## Live (human gate)

1. `npm run dev -- -p 3102`, open http://localhost:3102/dev, choose the expert flow, Start, allow mic.
2. Press **Run fixture scenario** (default offsets 0 / 8 / 70 / 140 s for evt-001 / evt-003 / evt-002 / evt-004).
3. Talk through the task 3–5 min with long explanations and thinking pauses. Watch the gate line ("waiting: expert speaking", "quiet 800/1200 ms" …) and counters.
4. Stop. Open `knowledge/sessions/<id>/timing-report.md`: interruptions = 0, processing ms ≈ 0–50, intentional wait reflects your pauses.
5. Expected records: ≥ 3 live questions, ≥ 1 guardrail, evt-003 only as an alias of evt-001 (no own exchange, no duplicate), first evt-004 exchange `clarify_reference`.
6. Too eager / too slow → change `pause_ms` in the console (stored with the session) and rerun.
