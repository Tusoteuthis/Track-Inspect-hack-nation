# Quickstart — validate WS6 Sprint 1

```bash
WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend
cd "$WT/web"
npm run typecheck && npx vitest run

npm run dev -- -p 3006 -H 0.0.0.0          # terminal 1
npm run replay-capture                     # terminal 2 → prints session id, PASS lines
curl -N localhost:3006/api/sessions/<sid>/stream?after=0   # IDs-only events
find ../knowledge/sessions ../knowledge/images -type f | wc -l
npm run replay-capture                     # run 2: all 200 / same acks
find ../knowledge/sessions ../knowledge/images -type f | wc -l   # unchanged
curl -N -H 'Last-Event-ID: 3' localhost:3006/api/sessions/<sid>/stream   # only seq > 3
open http://<LAN-IP>:3006/api/assets/<aid>/original
```

Expected: run 1 creates the session, assets, events and exchange; run 2 creates nothing new; the stream shows only `{seq,type,session_id,ids,at_utc}`.
