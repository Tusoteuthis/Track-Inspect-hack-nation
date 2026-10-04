# Quickstart / validation

```bash
cd web && npm run typecheck && npx vitest run
npm run sync-agents -- --agent expert
npm run probe -- expert --runs 5          # 19 cases, each ≥ 4/5
npm run dev -- -p 3104                    # http://localhost:3104/dev
```

Live: off the record → sentinel phrase → back on the record → finish → `grep -ri <sentinel> knowledge/sessions/<id>/` returns nothing; `completion.md`, `demo-evidence.md` present; console shows ElevenLabs deletion result.
