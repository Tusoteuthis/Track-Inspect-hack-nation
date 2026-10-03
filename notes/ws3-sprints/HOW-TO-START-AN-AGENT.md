# How to start a WS3 sprint agent

A step-by-step guide for the human: how to start a coding agent for a WS3 sprint, what to tell it, which files give it the context it needs, and how to make sure it stays in its own git worktree without touching other agents' work.

Several agents work in this repository at the same time (for example WS5, WS6 and WS7 in `.claude/worktrees/`). The shared main checkout (`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, branch `voice`) is therefore **off limits for sprint agents**. Every sprint agent gets its own worktree, its own branch and its own dev-server port.

---

## 1. Before you start a sprint

| Check | How |
|---|---|
| The previous sprint is merged into `voice` (skip for Sprint 0) | `git -C <repo> log --oneline -5` shows the merge of `worktree-ws03-sprint-(N-1)` |
| The previous handoff note exists (skip for Sprint 0) | `notes/ws3-sprints/handoff-sprint-(N-1).md` is on `voice` |
| ElevenLabs credentials exist | `<repo>/web/.env` has `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID_EXPERT` |
| The main checkout has nothing uncommitted that the sprint needs | A worktree only sees **committed** files on `voice` |

Sprint identities:

| N | Slug | Branch | Worktree | Port | Prompt file |
|---|---|---|---|---|---|
| 0 | `spike-contracts` | `worktree-ws03-sprint-0` | `<repo>/.claude/worktrees/ws03-sprint-0` | 3100 | `notes/ws3-sprints/sprint-0-spike-contracts.md` |
| 1 | `golden-path` | `worktree-ws03-sprint-1` | `<repo>/.claude/worktrees/ws03-sprint-1` | 3101 | `notes/ws3-sprints/sprint-1-golden-path.md` |
| 2 | `live-interview` | `worktree-ws03-sprint-2` | `<repo>/.claude/worktrees/ws03-sprint-2` | 3102 | `notes/ws3-sprints/sprint-2-live-interview.md` |
| 3 | `debrief-confirmation` | `worktree-ws03-sprint-3` | `<repo>/.claude/worktrees/ws03-sprint-3` | 3103 | `notes/ws3-sprints/sprint-3-debrief-confirmation.md` |
| 4 | `trust-completion` | `worktree-ws03-sprint-4` | `<repo>/.claude/worktrees/ws03-sprint-4` | 3104 | `notes/ws3-sprints/sprint-4-trust-completion.md` |

`<repo>` = `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`. The worktrees sit next to the other workstreams' worktrees (`.claude/worktrees/ws05-…`, `ws06-…`, `ws07-…`) and use the same naming: folder `ws03-sprint-N`, branch `worktree-ws03-sprint-N`.

## 2. Create the worktree and start the agent inside it

Run this in a terminal. Set `N` and `SLUG` from the table.

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
N=0; SLUG=spike-contracts
WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-$N

mkdir -p "$(dirname "$WT")"
git -C "$REPO" worktree add -b "worktree-ws03-sprint-$N" "$WT" voice   # new branch from the voice tip
cp "$REPO/web/.env" "$WT/web/.env"                                  # .env is gitignored, so copy it
cd "$WT" && claude                                                  # the agent's whole session now lives here
```

Why start the agent **inside** the worktree: its shell, its relative paths and the spec-kit scripts all resolve to the worktree. It can't accidentally write into the main checkout. The prompt has a fallback for agents started in the main checkout, but that relies on the agent following instructions.

## 3. What to tell the agent

You have two options. Both give the agent the same instructions.

**Option A — paste the full prompt (most reliable).** Open the sprint's prompt file (for example `notes/ws3-sprints/sprint-0-spike-contracts.md`), copy **all** of it, and paste it as the agent's first message. The file contains everything:

- **Top part (sprint-specific):**
  - role and goal
  - worktree identity (branch, path, port)
  - "Read first" file list
  - prerequisites
  - the design to implement
  - lanes for parallel subagents
  - out of scope
  - acceptance criteria
  - the human gate
- **Bottom part (shared context A1–A8, identical in every sprint):**
  - product summary
  - scope rules
  - challenge requirements
  - workstream ownership
  - current code
  - worktree rules (A6)
  - document layout
  - verification commands
  - handoff template

**Option B — short kickoff message.** This works because the prompt file is committed and present in the worktree. Paste:

```text
You are the WS3 Sprint <N> implementing agent. You were started inside your own git worktree.

1. Read the file notes/ws3-sprints/sprint-<N>-<slug>.md completely, top to bottom, before doing anything else. It is your full instruction set.
2. Run its section A6 location check first. Continue only if it confirms you are in /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-<N> on branch worktree-ws03-sprint-<N>. Otherwise stop and ask me.
3. Then read every file listed under "Read first" in that prompt, and follow the prompt exactly.
4. Never edit files in, or run git commands that change, the main checkout /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation. Never touch other agents' worktrees or branches. Do not merge or push.
5. When done, write notes/ws3-sprints/handoff-sprint-<N>.md, commit on your branch, and report the worktree path, branch, dev port and the human-gate steps.
```

## 4. Files that give the agent its context

The prompt tells the agent to read these. This list is for you, to check the agent actually read them.

**Always (every sprint):**

| File | Why |
|---|---|
| `notes/ws3-sprints/sprint-<N>-<slug>.md` | The full instructions for this sprint |
| `notes/03-elevenlabs-expert-interaction.md` | The WS3 brief: required behavior and acceptance criteria |
| `notes/ws3-sprints/sprint-plan.md` | Why the work is split, estimates, verification modes |
| `.specify/memory/constitution.md` | Project principles (filled in by Sprint 0) |
| `web/components/voice/VoiceSession.tsx`, `web/lib/voice/transcript.ts`, `web/lib/voice/flows.ts` | Existing voice integration to build on |
| `web/scripts/sync-agents.mts`, `web/scripts/probe-agents.mts` | How agent config is pushed and how behavior is tested without a mic |

**From Sprint 1 on (produced by earlier sprints):**

| File | Why |
|---|---|
| `notes/ws3-sprints/handoff-sprint-<N-1>.md` (and earlier handoffs) | What was delivered, decisions, deviations, open issues |
| `notes/ws3-sprints/docs/elevenlabs-capabilities.md` | Verified ElevenLabs facts and the recommended mechanisms. Overrides guesses. |
| `notes/ws3-sprints/docs/contracts-v0.md`, `web/lib/expert/contracts.ts` | Shared data formats |
| `web/lib/expert/*`, `web/components/expert/*`, `agents/expert/*`, `agents/probes.json` | The code and agent config built so far |

**Background (only when the prompt points to a section):**

| File | Why |
|---|---|
| `notes/project-brief.md` | Whole-project context and challenge requirements |
| `notes/02-glasses-iphone-visual-processing.md` §5 | PointingEvent contract from WS2 |
| `notes/05-knowledge-newcomer-tutor.md` §3–5 | What WS5 expects from WS3 |
| `notes/06-backend-integration.md`, `notes/07-frontend-user-experience.md` | Backend and frontend boundaries |

**Never give the agent:** WS4's evaluator answer key, or any interpretation of the traces. The expert supplies those during the session.

## 5. How the agent stays in its worktree (and how you check)

Rules the prompt enforces (section A6):

- All edits, commands, tests, dev servers and commits happen inside `<repo>/.claude/worktrees/ws03-sprint-<N>`.
- No `checkout`, `switch`, `reset`, `stash`, `clean`, `rebase`, `merge` or `pull` in the main checkout, and no file edits there.
- No touching other agents' worktrees or branches. Nothing gets deleted or forced.
- The dev server runs on the sprint's own port (`npm run dev -- -p 310<N>`).
- Spec-kit folders use timestamped names (`specs/<timestamp>-ws3-sprint-<N>-<slug>/`) so they don't collide with other workstreams' numbered specs.
- Parallel subagents for lanes each get their own nested worktree branched from the sprint branch.
- It only updates the **expert** ElevenLabs agent (`npm run sync-agents -- --agent expert`).
- If the agent finds itself in an unexpected location or branch, it stops and asks you.

Spot checks you can run at any time:

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
git -C "$REPO" status --short          # the main checkout must show NO sprint files (only pre-existing items such as .claude/worktrees/)
git -C "$REPO" worktree list           # the sprint worktree is listed on its worktree-ws03-sprint-N branch
git -C "$WT" log --oneline voice..HEAD # the sprint's commits, only on its branch
```

If sprint files show up in the main checkout, stop the agent. Move the changes into the worktree, or discard them after checking that no other agent owns them.

## 6. When the agent reports done

1. Read `notes/ws3-sprints/handoff-sprint-<N>.md` in the worktree. In particular, read "Decisions made" (deviations from the prompt) and "Verification evidence".
2. Do the **human gate** from the end of the sprint prompt, running the app from the worktree:
   ```bash
   cd "$WT/web" && npm run dev -- -p 310<N>     # open http://localhost:310<N>
   ```
3. If it's good, merge it and clean up. The main checkout must be clean, with no other agent mid-commit:
   ```bash
   git -C "$REPO" status
   git -C "$REPO" merge --no-ff worktree-ws03-sprint-<N>
   git -C "$REPO" worktree remove "$WT"
   ```
4. Only now create the worktree for sprint `N+1` (step 2), so it starts from a `voice` that contains this sprint.

If it's not good, tell the same agent what to fix. It keeps working in the same worktree.
