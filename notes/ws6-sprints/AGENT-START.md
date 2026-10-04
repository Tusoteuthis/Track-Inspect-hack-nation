# How to start a WS6 agent

How to hand a WS6 sprint to a fresh coding agent: what to tell it, which files give it the context, and how to keep it inside the WS6 worktree so it can't damage other agents' work.

Several agents work on this repo at the same time, each in its own git worktree:

| Workspace | Path | Branch | Used by |
|---|---|---|---|
| Main checkout | `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation` | `voice` | you (merges), WS3 |
| **WS6 worktree** | `…/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend` | `worktree-ws06-backend` + one feature branch per sprint | **WS6 agents only** |
| Other worktrees | `…/.claude/worktrees/ws05-*`, `ws07-*` | their own | WS5, WS7 agents |

---

## 1. Before you start an agent (once per sprint, ~1 min)

```bash
WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend

git -C "$WT" status --short          # should be clean (or only untracked WS6 notes)
git -C "$WT" branch --show-current   # should be worktree-ws06-backend (merge the last sprint first, see §5)
ls "$WT"/notes/ws6-sprints/handoff-sprint-*.md 2>/dev/null   # the previous sprint's handoff must exist (not needed for Sprint 0)
lsof -i :3006                        # nothing should be running on WS6's port
```

If the worktree is missing, recreate it **from the main checkout** (this is the only command you run there):
```bash
cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
git worktree add .claude/worktrees/ws06-backend -b worktree-ws06-backend voice
```

## 2. Start the agent in the worktree

```bash
cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend
claude
```

**Always start it from this directory.** Claude Code treats the start directory as its project and resets the shell there after each command. An agent started in the main checkout keeps drifting back into it, and `cd` doesn't fix that.

## 3. What to tell the agent

Pick one of two ways. The result is the same.

**Option A: paste the whole sprint file** (most robust). Open `notes/ws6-sprints/sprint-N-*.md` and paste its full contents as the first message.

**Option B: a short kickoff message.** Paste this and change the sprint number and file name:

```text
You are the WS6 (shared backend) implementing agent for Sprint N.

1. First run `git rev-parse --show-toplevel`. It must print
   /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend
   If it does not, stop and tell me. Do not cd around it.
2. Read notes/ws6-sprints/sprint-N-<name>.md completely. It is your full instruction set,
   including the shared context in its sections A1–A8. Follow it exactly.
3. Then read the files listed in its "Read first" section and in "Context reading list" below.
4. Rules: work only inside this worktree; never write, install, check out branches or run
   servers in the main checkout or other worktrees; never use `git stash`; dev server on
   port 3006 only; do not merge or push. Finish with notes/ws6-sprints/handoff-sprint-N.md
   and tell me the human-gate steps.
```

Don't add new requirements in chat that contradict the sprint file. If something has to change, edit the sprint file first, so later agents see the same instructions.

## 4. Context reading list

Every sprint prompt is self-contained. These are the files the agent reads for context, in this order. Paths are relative to the worktree root.

**Every sprint:**

| File | Why |
|---|---|
| `notes/ws6-sprints/sprint-N-*.md` | The instructions, including shared context A1–A8 |
| `notes/06-backend-integration.md` | The WS6 brief: ownership, the 8-step flow, §10 acceptance criteria |
| `notes/06a-ws6-sprint-plan.md` | Why it is split, decisions, risks, open questions |
| `notes/ws6-sprints/handoff-sprint-(N-1).md` | What the previous sprint delivered and decided, which stubs remain |
| `notes/ws6-api-v0.md` (from Sprint 0 on) | The route map and contracts WS6 has published |
| `.specify/memory/constitution.md` | Project principles spec-kit checks against |
| `notes/project-brief.md` | Only if the product context is unclear |

**Additionally, per sprint:**

| Sprint | Partner context |
|---|---|
| 0: Foundation & contracts | `notes/02-glasses-iphone-visual-processing.md` §5 (PointingEvent), `notes/ws3-sprints/sprint-0-spike-contracts.md` "Lane C" + `sprint-1-golden-path.md` "Persistence", `notes/05-knowledge-newcomer-tutor.md` §3–5, `notes/04-prototype-data-scenarios.md`, `notes/07-frontend-user-experience.md` §4 |
| 1: Expert capture | `web/app/api/conversation-token/route.ts`, `web/lib/voice/flows.ts`, WS3 code if merged (`web/lib/expert/`), `notes/ws3-sprints/handoff-sprint-*.md` |
| 2: Knowledge & confirmation | `notes/05-knowledge-newcomer-tutor.md`, `notes/ws5-sprints/sprint-plan.md`, any merged WS5 modules, `notes/ws3-sprints/sprint-3-debrief-confirmation.md` |
| 3: Newcomer & pre-save | `notes/05-knowledge-newcomer-tutor.md` (evaluation outcomes, assessment), `notes/04-prototype-data-scenarios.md` (evaluator-only material), `notes/07-frontend-user-experience.md` §4 |
| 4: Trust & demo | `notes/ws3-sprints/sprint-4-trust-completion.md`, WS5 eligibility/revocation rules, `notes/02-glasses-iphone-visual-processing.md` (off-record capture), all earlier WS6 handoffs |

**Partner notes not yet merged** (for example `notes/ws5-sprints/` with WS5's sprint plan and prompts, which currently lives only on branch `worktree-ws05-knowledge-tutor`) may be read, **read-only**, from the main checkout's `notes/` or from the partner's worktree `…/.claude/worktrees/ws05-*/notes/`. They are never copied into the WS6 branch.

## 5. How the agent stays in the worktree

Already written into every sprint prompt; listed here so you can check them:

1. **Stop check first.** `git rev-parse --show-toplevel` must print the WS6 worktree path; otherwise the agent stops.
2. **Writes only under the worktree,** using absolute paths in `…/.claude/worktrees/ws06-backend/`. The main checkout and other worktrees are read-only.
3. **Partner work comes in through a merge, never by editing in place.** At startup it runs `git merge --no-edit voice` into `worktree-ws06-backend`. On a conflict outside WS6 files it runs `git merge --abort` and asks you.
4. **Its own runtime:** its own `node_modules` (`npm install` in `web/`), its own data (`knowledge/` and `web/.runtime/` inside the worktree), port **3006**, and it stops its dev server when done. `web/.env` is copied from the main checkout and never printed or committed.
5. **No `git stash`.** The stash stack is shared by all worktrees, so the agent uses WIP commits instead.
6. **Lane subagents get nested worktrees** (`.claude/worktrees/ws06-sN-laneX`, branched from the sprint's feature branch), removed when merged back.
7. **No merge into `worktree-ws06-backend` or `voice`, no push.** You do that after the gate.

**Signs that something went wrong, and what to do:**

| Symptom | Action |
|---|---|
| Agent says the stop check failed | Exit it, `cd` into the worktree, start again |
| `git -C /Users/…/Track-Inspect-hack-nation status` shows WS6 files in the main checkout | Stop the agent and move the files into the worktree by hand (`mv`); don't let the agent "clean up" |
| Port 3006 already in use | `lsof -i :3006`, then stop the old WS6 dev server; never take another agent's port |
| Agent reports a `voice` merge conflict | Resolve it yourself or ask the partner owner, then restart the sprint |
| Agent wants to edit WS3/WS5/WS7 code | It should write a "Request to partner workstreams" in the handoff instead |

## 6. After the agent finishes

1. Read `notes/ws6-sprints/handoff-sprint-N.md`, especially "Decisions made", "Stubs still in place" and "Requests to partner workstreams".
2. Run the **human gate** listed at the end of the sprint file.
3. Merge into the WS6 base:
   ```bash
   cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend
   git checkout worktree-ws06-backend
   git merge --no-ff <sprint-feature-branch>
   ```
4. When partners should receive WS6's work, merge it into `voice` from the main checkout:
   ```bash
   cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
   git merge --no-ff worktree-ws06-backend
   ```
5. Start the next sprint at §1 with a **fresh** agent. Don't reuse the old conversation; the handoff note carries the context forward.
