# Quickstart: validate Sprint 3

```bash
cd .claude/worktrees/ws7-sprint-3/web
npm run typecheck
npx vitest run
PW_PORT=3103 npx playwright test
npm run build
```

## Manual (fixture mode, `npm run dev -- -p 3103`)
1. `/` → "Expert session". Pick a case. The statuses read Unknown / Not connected / No backend (fixture data). None of them reads "Connected".
2. "Open trace display" opens a new window with the full-bleed trace, the FIXTURE badge and "Esc to exit".
3. "Start session" shows "Starting…" and then the companion. Over about 8 s, resolved → repeat → ambiguous events arrive. The ambiguous one is drawn dashed with "Ambiguous: the apprentice will ask you to clarify".
4. Press `O`. "Going off record… waiting for confirmation" appears, then OFF RECORD.
5. "Simulate connection drop" → "Reconnecting…". "Restore" → the latest state comes back.
6. Press `S` twice. "Stopping…" appears, then "Session ended" with "Open debrief review", which leads to `/review`.

URL options:
- `?fixture_latency=5000` slows the acks.
- `?fixture_fail=offrecord|pause|stop` makes the matching request fail.
- `?fixture_replay_ms=300` speeds up the event replay.
