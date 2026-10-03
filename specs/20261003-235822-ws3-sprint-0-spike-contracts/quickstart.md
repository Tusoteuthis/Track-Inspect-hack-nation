# Quickstart: validate Sprint 0

Run everything inside the worktree `.claude/worktrees/ws03-sprint-0`.

```bash
cd web
npm ci
npm run typecheck   # expect: no errors
npm test            # expect: all tests pass (transcript sanity, 5 fixtures valid, invalid samples rejected)
```

Manual checks:

1. **Fixtures:** `ls web/fixtures/pointing-events/` lists 5 JSON files. Each has `"source": "fixture"`, and none contains an interpretation of the trace.
2. **Images:** open `web/public/fixtures/*.svg` in a browser. Each one visibly says FIXTURE.
3. **Contracts:** `notes/ws3-sprints/docs/contracts-v0.md` is marked "v0, pending agreement" and lists open questions for WS2, WS5 and WS6. Field details match [data-model.md](data-model.md).
4. **Capabilities:** `notes/ws3-sprints/docs/elevenlabs-capabilities.md` answers Q1–Q10 with sources and contains "Recommended mechanisms" with VERIFIED or DOCUMENTED-ONLY labels.
5. **Constitution:** `.specify/memory/constitution.md` is at version 1.0.0 with no `[PLACEHOLDER]` tokens.
