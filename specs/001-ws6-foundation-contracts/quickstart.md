# Quickstart: verify WS6 Sprint 0

Run from the WS6 worktree (`WT=.claude/worktrees/ws06-backend`).

```bash
cd "$WT/web"
npm install
npm run typecheck          # expect: no output, exit 0
npx vitest run             # expect: all test files pass
npm run dev -- -p 3006     # in a second shell:
curl -s localhost:3006/api/health | jq
# expect: ok true, schema_version "ws6.v0", both *_writable true, modules {}
```

These scenarios map to the spec stories:

| Story | Test file |
|---|---|
| US1 (contracts) | `web/lib/contracts/contracts.test.ts` |
| US2 (store and locks) | `web/lib/backend/store.test.ts`, `locks.test.ts`, `ids.test.ts` |
| US3 (health) | `web/app/api/health/route.test.ts`, plus the curl check above |
| US4 (route map) | Read `notes/ws6-api-v0.md`. Check every resource and route group in the brief §4, plus the WS2/WS3/WS5/WS7 sections. |

After the checks, confirm that `git status` shows no `knowledge/sessions`, `knowledge/images` or `web/.runtime` files.
