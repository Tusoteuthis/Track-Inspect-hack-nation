# Quickstart: validate Sprint 1

All commands run from `<worktree>/web`.

1. `npm run typecheck && npm test` should come back green, including the session, context-update, render, store and validator tests.
2. `npm run sync-agents -- --agent expert`. Use `--create-missing` on the first run, then add the printed id to `web/.env`. The read-back should show the system prompt length, `toolIds` containing `begin_question`, `turn_eagerness=patient` and the `skip_turn` status.
3. `npm run probe -- expert --runs 5` prints a pass count for each of cases 1–5. Each count should be at least 4/5.
4. Start `npm run dev -- -p 3101`, then try the save route:
   - `curl -X PUT localhost:3101/api/expert-sessions/ses-test-0001/snapshot -d @<sample>.json` should return 200, and `../knowledge/sessions/ses-test-0001/` should contain all 6 files.
   - A bad id such as `ses_BAD` should return 400.
5. Human gate: see `notes/ws3-sprints/sprint-1-golden-path.md` "Human gate".
