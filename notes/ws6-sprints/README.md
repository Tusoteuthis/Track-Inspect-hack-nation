# WS6 sprint prompts: paste-ready agent instructions

Each `sprint-N-*.md` file is a **self-contained prompt**. Start a fresh coding agent **inside the WS6 worktree** (`cd .claude/worktrees/ws06-backend && claude`) and paste the whole file as its first message. Each prompt begins with a stop check: an agent started anywhere else refuses to work. Sprint-specific instructions come first; the shared WS6 context (A1–A8) follows and is identical in every file.

**New here? Start with [`AGENT-START.md`](AGENT-START.md)**: how to start an agent, what to tell it, which files to read, and how it stays in the worktree.

Overview and rationale: [`../06a-ws6-sprint-plan.md`](../06a-ws6-sprint-plan.md). Source brief: [`../06-backend-integration.md`](../06-backend-integration.md).

| Order | File | Delivers | Agent time | Human gate | Status |
|---|---|---|---|---|---|
| 0 | `sprint-0-foundation-contracts.md` | contracts + zod, fixtures, store/ID/idempotency primitives, `notes/ws6-api-v0.md`, health | ~1–1.5 h | ~15 min: approve and share the route map | DONE 2026-10-04 ([handoff](handoff-sprint-0.md)), merged into `worktree-ws06-backend` |
| 1 | `sprint-1-expert-capture-path.md` | sessions, evidence upload/read, idempotent events/exchanges, SSE with replay, diag log, replay script | ~2–3 h | ~20 min: SSE reconnect, LAN asset access | DONE 2026-10-04 ([handoff](handoff-sprint-1.md)), gate pending |
| 2 | `sprint-2-knowledge-confirmation.md` | WS5 module host + stub, synthesis jobs, Markdown revisions, revision-bound confirmation, Work Map API | ~2–3 h | ~20 min: Markdown on disk, stale confirm rejected | next |
| 3 | `sprint-3-newcomer-presave.md` | newcomer session, evaluator separation, draft/evaluation binding, commit guard, assessment | ~3 h | ~20 min: wrong draft intercepted, bypasses blocked | — |
| 4 | `sprint-4-trust-recovery-demo.md` | off-record, deletion/revocation cascade, access token, diagnostics, e2e script, README | ~2–3 h | ~30 min: fresh-clone startup + full e2e | — |

## Worktree setup (several agents work in parallel)

WS6 works **only** in its own git worktree, so it never touches the main checkout (`voice`, used by the human and WS3) or other agents' worktrees (`ws05-*`, `ws07-*`).

| | Path | Branch |
|---|---|---|
| WS6 worktree | `.claude/worktrees/ws06-backend` | `worktree-ws06-backend` (WS6 base) + one spec-kit feature branch per sprint |
| Shared integration | main checkout | `voice` |

- **Start the agent inside the worktree:** `cd .claude/worktrees/ws06-backend && claude`, then paste the sprint file. Each prompt's A6 step 2 checks that it is in the right directory, merges `voice` in to pick up partner work, copies `web/.env` from the main checkout and runs `npm install` locally.
- **Port 3006** is WS6's dev server (`npm run dev -- -p 3006`), so it never collides with other agents.
- `knowledge/` and `web/.runtime/` resolve inside the worktree, so WS6 test data stays isolated.
- Lane subagents get nested worktrees (`.claude/worktrees/ws06-sN-laneX`) and remove them when done.

## Rules for running them

- **Strictly sequential.** Each sprint reads the previous `handoff-sprint-N.md` and needs the previous feature branch merged into `worktree-ws06-backend`.
- **The agents do not merge or push.** After the human gate:
  ```bash
  cd .claude/worktrees/ws06-backend
  git checkout worktree-ws06-backend && git merge --no-ff <feature-branch>
  # when partners should receive it (from the main checkout, on voice):
  cd ../../.. && git merge --no-ff worktree-ws06-backend
  ```
- **Partners move in parallel.** WS3 and WS5 also merge into `voice`. Every prompt tells the agent to reuse partner code that has already been merged (WS3 contracts and store, WS5 modules) and to use labelled stubs otherwise. Read each handoff's "Stubs still in place" and "Requests to partner workstreams" sections before merging.
- **The spec-kit short names are prefixed `ws6-`** to avoid colliding with other workstreams' `specs/NNN-*` folders.
