# How to start a WS5 sprint agent

A step-by-step guide for the human: how to create a sprint's worktree, start a coding agent **inside it**, what to tell the agent, which files give it the context it needs, and how to check that it doesn't touch other agents' work.

Several agents work in this repository at the same time (WS3, WS6, WS7 in `.claude/worktrees/`). The shared main checkout (`<repo>` = `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, branch `voice`) is therefore **off limits for sprint agents**. Every WS5 sprint agent gets its own worktree, its own branch and its own dev-server port.

---

## 1. Before you start a sprint (checklist)

| Check | How | If it fails |
|---|---|---|
| The WS5 prompts are on `voice` | `git -C <repo> ls-tree voice notes/ws5-sprints/` lists the sprint files | Merge the WS5 planning branch into `voice` first. A worktree only sees **committed** files on `voice`. |
| The previous WS5 sprint is merged (skip for Sprint 1) | `git -C <repo> log --oneline -5 voice` shows the merge of `worktree-ws05-sprint-(N-1)`, and `notes/ws5-sprints/handoff-sprint-(N-1).md` is on `voice` | Finish the previous sprint's human gate and merge first |
| Partner prerequisites are met | Read the **Prerequisites** section of the sprint prompt. Sprint 1 needs WS3 Sprint 0 merged: `.specify/memory/constitution.md` filled, vitest in `web/package.json`, `web/lib/expert/contracts.ts` present. | Wait, or tell the agent explicitly to proceed against the documented interfaces with labelled stubs (it records that in its handoff) |
| Decision D1 is recorded (Sprint 3 only) | `notes/ws5-sprints/sprint-plan.md` → "Open decisions" names the evaluation mechanism and LLM provider | Decide it first |
| Credentials exist | `<repo>/web/.env` exists (ElevenLabs key; tutor agent ID for Sprint 4; LLM key for Sprint 3 if D1 needs one) | The agent does what it can and lists what is blocked |
| Nobody else runs the same sprint | `git -C <repo> worktree list` shows no `ws05-sprint-N` | Don't start a second agent on the same sprint |

Sprint identities:

| N | Slug | Branch | Worktree | Port | Prompt file |
|---|---|---|---|---|---|
| 1 | `knowledge-schema` | `worktree-ws05-sprint-1` | `<repo>/.claude/worktrees/ws05-sprint-1` | 3501 | `notes/ws5-sprints/sprint-1-knowledge-schema.md` |
| 2 | `synthesis-workmap` | `worktree-ws05-sprint-2` | `<repo>/.claude/worktrees/ws05-sprint-2` | 3502 | `notes/ws5-sprints/sprint-2-synthesis-workmap.md` |
| 3 | `tutor-evaluation` | `worktree-ws05-sprint-3` | `<repo>/.claude/worktrees/ws05-sprint-3` | 3503 | `notes/ws5-sprints/sprint-3-tutor-evaluation.md` |
| 4 | `voice-assessment` | `worktree-ws05-sprint-4` | `<repo>/.claude/worktrees/ws05-sprint-4` | 3504 | `notes/ws5-sprints/sprint-4-voice-assessment.md` |

Run the sprints **in order**, one at a time. Within a sprint the agent may run parallel lanes itself.

---

## 2. Create the worktree and start the agent inside it

Run this in a **new** terminal. Set `N` from the table.

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
N=1
WT=$REPO/.claude/worktrees/ws05-sprint-$N

git -C "$REPO" worktree add -b "worktree-ws05-sprint-$N" "$WT" voice   # new branch from the voice tip
cp "$REPO/web/.env" "$WT/web/.env"                                    # .env is gitignored, so copy it
cd "$WT" && claude                                                    # the agent's whole session now lives here
```

Why start the agent **inside** the worktree: its shell, its relative paths and the spec-kit scripts all resolve to the worktree, so it can't accidentally write into the main checkout or another agent's worktree. The prompt has a fallback for agents started in the main checkout, but that relies on the agent following instructions.

Never start a sprint agent inside another workstream's worktree, or inside the WS5 planning worktree `ws05-knowledge-tutor`.

---

## 3. What to tell the agent

Two options; both give the agent the same instructions.

**Option A: paste the full prompt (most reliable).** Open the sprint's prompt file, copy **all** of it and paste it as the first message.
- The top part is sprint-specific: role, worktree identity, "Read first", prerequisites, scope, lanes, out of scope, acceptance criteria, human gate.
- The bottom part is the shared WS5 context A1–A8, identical in every sprint: product, scope rules, challenge requirements, ownership, repo state, worktree rules (A6), doc layout (A6c), verification, handoff template.

**Option B: short kickoff message.** This works because the prompt file is committed and present in the worktree. Fill in `N` and the slug, then paste:

```text
You are the WS5 Sprint <N> implementing agent. You were started inside your own git worktree.

1. Read notes/ws5-sprints/sprint-<N>-<slug>.md completely, top to bottom, before doing anything else.
   It is your full instruction set.
2. Run its section A6 location check first. Continue only if it confirms you are in
   /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-<N>
   on branch worktree-ws05-sprint-<N>. Otherwise stop and ask me.
3. Show me the output of: pwd; git rev-parse --show-toplevel; git branch --show-current; git worktree list.
   Then run the A6 "Checks after setup" and report them. Wait for my "go".
4. After "go": read every file under "Read first" and follow the prompt exactly.
5. Never edit files in, or run git commands that change, the main checkout
   /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation. Never touch other agents'
   worktrees or branches. Only edit WS5 paths (web/lib/knowledge/, web/fixtures/ws5/, agents/tutor/,
   notes/ws5-sprints/, specs/*-ws5-*). Do not merge or push.
6. When done, write notes/ws5-sprints/handoff-sprint-<N>.md, commit on your branch, and report the
   worktree path, branch, dev port and the human-gate steps.
```

If you have extra context (a meeting decision, a changed interface), add it after the prompt or kickoff, or write it into `sprint-plan.md` and merge that into `voice` before creating the worktree.

---

## 4. Files that give the agent its context

The prompt tells the agent to read these. This list is for you, to check the agent actually read them.

| Order | File(s) | Why |
|---|---|---|
| 1 | `notes/ws5-sprints/sprint-N-*.md` | The task: scope, acceptance criteria, human gate, shared rules (A1–A8) |
| 2 | `notes/05-knowledge-newcomer-tutor.md` | The WS5 brief (sections named in the prompt) |
| 3 | `notes/ws5-sprints/sprint-plan.md` | Decisions, dependencies, open decisions (e.g. D1) |
| 4 | `notes/ws5-sprints/handoff-sprint-(N-1).md` | What the previous WS5 sprint delivered, deviations, notes for this sprint |
| 5 | `notes/ws5-sprints/docs/knowledge-schema-v0.md` (Sprint 2+) | The WS5 schema contract |
| 6 | Partner material named in "Read first": WS3 `notes/ws3-sprints/` (+ `docs/contracts-v0.md`, `docs/elevenlabs-capabilities.md`, `docs/voice-interface.md`) and `web/lib/expert/`; WS6 `notes/ws6-sprints/`, `web/lib/contracts/`, `web/lib/backend/`; WS7 `notes/ws7-sprints/`; WS4 `notes/04-prototype-data-scenarios.md` | Interfaces we must match, not fork |
| 7 | Partner handoffs: `notes/ws3-sprints/handoff-*`, `notes/ws6-sprints/handoff-*`, `notes/ws7-sprints/handoff-*` | Look for "Requests to partner workstreams" addressed to WS5 |
| 8 | `notes/project-brief.md` | Only if overall context is unclear |

---

## 5. How to check the agent stays in its worktree

**Right after start** (the kickoff makes the agent print these):
- `pwd` and `git rev-parse --show-toplevel` → `<repo>/.claude/worktrees/ws05-sprint-N`
- `git branch --show-current` → `worktree-ws05-sprint-N`
- `git worktree list` → the other worktrees unchanged

**During the sprint**, from any terminal:
```bash
git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation status --short           # main checkout: no new changes from the WS5 agent
git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation log --oneline -3 voice   # no WS5 sprint commits on voice
git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-N log --oneline -5   # WS5 commits land here
```

**Red flags, stop the agent immediately:**
- It edits files under `<repo>/…` outside its own `.claude/worktrees/ws05-sprint-N/`, or runs git there.
- It runs `git checkout`, `git stash`, `git reset` or `git merge` anywhere other than its own worktree.
- It edits `web/lib/expert/`, `web/lib/backend/`, `web/lib/contracts/`, `web/app/` (other than the Sprint 4 dev harness), or another workstream's notes.
- It runs `npm run sync-agents` without `-- --agent tutor`.

If that happens: interrupt, tell it which rule it broke, and check `git -C <repo> status` for stray changes before anyone else commits.

---

## 6. After the agent finishes

1. Read `notes/ws5-sprints/handoff-sprint-N.md` **in the agent's worktree**: delivered files, verification output, deviations, requests to partners.
2. Run the **human gate** from the sprint prompt, from the worktree: `cd <repo>/.claude/worktrees/ws05-sprint-N/web && npm run dev -- -p 350N`.
3. If satisfied, merge from the main checkout at a moment when no other agent is committing:
   ```bash
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation status --short   # must be clean
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws05-sprint-N
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-N
   ```
4. Forward any "Requests to partner workstreams" from the handoff to the WS3, WS4, WS6 or WS7 owners.
5. Start the next sprint (back to section 1).

---

## 7. Troubleshooting

| Situation | What to do |
|---|---|
| The agent says `notes/ws5-sprints/` is missing in its worktree | The prompts aren't merged into `voice` yet. Stop it, `git -C <repo> worktree remove <WT>` and `git -C <repo> branch -d worktree-ws05-sprint-N`, merge the prompts, then recreate. |
| `worktree add` fails because the branch or folder already exists | A previous attempt is still around. Inspect it (`git -C <that worktree> log`, `status`). Remove it only if its work is no longer needed. |
| A prerequisite from another workstream is missing | Either wait, or tell the agent "proceed against the documented interface with labelled stubs and list it in the handoff". |
| The merge into `voice` conflicts | Usually a shared file (`web/package.json`, `agents/manifest.json`, `agents/probes.json`). Resolve it keeping both sides; never drop another workstream's entries. |
| The agent wants to change a partner's file | It must not. Have it write the request in its handoff and forward it to that workstream's owner. |
