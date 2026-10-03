# How to start a WS7 sprint agent

How to hand a WS7 sprint to a fresh coding agent: what to tell it, what it must read, and how to keep it inside its own git worktree so it can't damage work by the other agents running on this repo.

Overview: [`../07a-ws7-sprint-plan.md`](../07a-ws7-sprint-plan.md) · Sprint list: [`README.md`](README.md)

---

## 1. One-time prerequisite

The WS7 prompts must be on `voice`, because every sprint agent branches from `voice`. From the main checkout:

```bash
cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
git log --oneline -1 -- notes/ws7-sprints   # prints a commit → already on voice, skip the merge
git merge --ff-only worktree-ws07-frontend  # only if the line above printed nothing
```

## 2. Pick the sprint

| Sprint | Prompt file | Start only when |
|---|---|---|
| S0 | `sprint-0-shell-contracts-viewer.md` | Step 1 is done |
| S1 | `sprint-1-work-map-review.md` | S0 is merged into `voice` (may run in parallel with S2) |
| S2 | `sprint-2-practice-presave.md` | S0 is merged into `voice` (may run in parallel with S1) |
| S3 | `sprint-3-expert-companion.md` | S0 is merged; WS3 Sprint 1 is merged into `voice` |
| S4 | `sprint-4-summary-integration.md` | S1–S3 are merged |

"Merged" means the previous sprint's `handoff-sprint-N.md` exists on `voice`. Check it with `ls notes/ws7-sprints/handoff-*` in the main checkout.

## 3. Create the worktree *before* starting the agent

This is what keeps agents apart. Don't rely on the agent to create its own worktree. Start it already inside one. Replace `N` with the sprint number:

```bash
cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
git worktree add -b ws7-sprint-N .claude/worktrees/ws7-sprint-N voice
cd .claude/worktrees/ws7-sprint-N
cp ../../../web/.env web/.env        # only if the sprint needs voice (S2, S3 gates); .env is not in git
(cd web && npm install)              # node_modules is not shared between worktrees
claude                               # start the agent HERE, not in the repo root
```

Check before you paste anything. The agent's first status line or `pwd` must show `.claude/worktrees/ws7-sprint-N`. If it shows the repo root, stop and restart it in the worktree.

## 4. What to tell the agent

Paste this as the **first message** (fill in `N` and the file name):

```text
You are the WS7 Sprint N agent. You are running inside the git worktree
.claude/worktrees/ws7-sprint-N on branch ws7-sprint-N. Stay in it.

Your full instructions are in notes/ws7-sprints/<sprint-file>.md.
Read that whole file first — including the shared context sections B1–B8 at the bottom —
then read every file in its "Read first" list before writing any code.

Hard rules:
- Work only inside this worktree. Never cd to the repo root or another worktree,
  never use `git -C <other path>`, never run bare `git stash`.
- Do not merge into voice and do not push. I merge after the human gate.
- Do not edit other workstreams' notes or code, or the root .gitignore.
- When done, write notes/ws7-sprints/handoff-sprint-N.md and tell me the human-gate steps.
```

Alternatively, paste the whole sprint file as the first message. It is self-contained. The short message above is preferred: it keeps the worktree rules at the top, and the agent reads the file from disk.

## 5. Context the agent must read

Every sprint file lists its own "Read first" files. Overall:

| Always | Why |
|---|---|
| `notes/ws7-sprints/<sprint-file>.md` | The task, scope, acceptance criteria, human gate, and shared rules B1–B8 |
| `notes/07-frontend-user-experience.md` | The WS7 brief: what the UI must and must not do |
| `notes/07a-ws7-sprint-plan.md` | Why the work is split, dependencies, coordination risks |
| `notes/ws7-sprints/handoff-sprint-*.md` (earlier sprints) | What was actually built, decisions, contract changes |
| `notes/ws7-ui-contracts-v0.md`, `web/lib/ui/contracts.ts`, `web/lib/data/` | UI contracts and data layer (S1 onward) |

| Sprint-specific | Sprint |
|---|---|
| `notes/06-backend-integration.md` (and any WS6 plan or contract notes on `voice`) | All; essential for S4 |
| `notes/05-knowledge-newcomer-tutor.md`, `notes/05-sprint-plan.md` | S1, S2, S4 |
| `notes/04-prototype-data-scenarios.md` (answer-key separation) | S0, S2 |
| `notes/02-glasses-iphone-visual-processing.md` §5 | S0, S3 |
| `notes/03-elevenlabs-expert-interaction.md`, `notes/ws3-sprints/handoff-sprint-*.md`, `web/lib/expert/contracts.ts` | S1, S3 |
| `web/components/voice/VoiceSession.tsx`, `web/lib/voice/` | S0, S2, S3 |
| `notes/project-brief.md` | Background, if anything is unclear |

## 6. Staying in the worktree (rules for agent and human)

- **One sprint = one worktree = one agent.** Never start two agents in the same worktree. S1 and S2 in parallel need two worktrees.
- Each worktree has its own working files and branch, so agents can't overwrite each other's uncommitted work. They share the git object store, the branch names and the **stash**. That's why bare `git stash` is forbidden.
- spec-kit's `/speckit-specify` creates a feature branch (e.g. `00N-…`) *inside* the worktree. That is fine. The branch to merge is whichever one the handoff note names.
- spec-kit numbers features sequentially per branch, so parallel agents (WS3/WS5/WS7) may each create a `specs/00N-…` with the same number. The names differ and nothing breaks; renumber later if it bothers you.
- If an agent says it needs to change something outside WS7, such as `VoiceSession.tsx` internals, a WS3 contract or the root `.gitignore`, it records that in the handoff instead of editing. You relay it to the owning workstream.

## 7. After the agent reports done

1. Read `notes/ws7-sprints/handoff-sprint-N.md` in the sprint worktree, especially **Decisions made** and **Human gate checklist**.
2. Do the human gate (`cd .claude/worktrees/ws7-sprint-N/web && npm run dev`).
3. Merge from the main checkout:
   ```bash
   cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
   git merge <branch named in the handoff>
   ```
   If `voice` moved meanwhile and there are conflicts (most likely in `web/app/page.tsx` or `web/package.json` with WS3), resolve them in the sprint worktree first: `git merge voice` there, re-run tests, then merge.
4. Clean up once merged:
   ```bash
   git worktree remove .claude/worktrees/ws7-sprint-N
   git branch -d ws7-sprint-N
   ```

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Agent is working in the repo root | Stop it. Check `git status` in the root for stray changes, and move them into the worktree with a WIP commit there or discard them. Restart the agent inside the worktree |
| `fatal: '<branch>' is already checked out` | That branch is in use by another worktree. Pick a new branch name, or reuse that worktree instead |
| Agent can't find `notes/07a-…` or the prompts | Step 1 wasn't done: the docs aren't on `voice` yet |
| Agent can't find a previous handoff | The previous sprint isn't merged into `voice`. Merge it first, then in the worktree run `git merge voice` |
| Voice doesn't connect | `web/.env` is missing in the worktree (step 3) |
