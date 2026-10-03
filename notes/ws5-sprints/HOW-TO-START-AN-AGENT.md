# How to start a WS5 sprint agent

A step-by-step guide for the human: what to tell a new coding agent, which files give it the context it needs, and how to make sure it stays in its own git worktree so it doesn't corrupt the other agents' work.

---

## 1. Before you start an agent (checklist)

| Check | How | If it fails |
|---|---|---|
| The WS5 prompts are on `voice` | `git -C <repo> ls-tree voice notes/ws5-sprints/` lists the sprint files | Commit `notes/ws5-sprints/` and merge it into `voice` first |
| The previous WS5 sprint is merged | `git -C <repo> log --oneline voice` shows the `ws5/sprint-(N-1)-…` merge, and `notes/ws5-sprints/handoff-sprint-(N-1).md` exists on `voice` | Finish the previous sprint's human gate and merge first |
| The sprint's partner prerequisites are met | Read the **Prerequisites** section of the sprint prompt (e.g. Sprint 1 needs WS3 Sprint 0 merged: `.specify/memory/constitution.md` filled, vitest in `web/package.json`, `web/lib/expert/contracts.ts` present) | Wait, or tell the agent explicitly to proceed with stubs (it records that in its handoff) |
| Decision D1 is recorded (Sprint 3 only) | `notes/ws5-sprints/sprint-plan.md` → "Open decisions" names the evaluation mechanism and LLM provider | Decide it first |
| `web/.env` exists in the main checkout | `ls <repo>/web/.env` | The agent copies it into its worktree; without it, ElevenLabs and LLM steps are blocked |
| Nobody else runs the same sprint | `git -C <repo> worktree list` shows no `ws5-sprint-N` | Don't start a second agent on the same sprint |

`<repo>` = `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`

---

## 2. Which prompt to use

| Sprint | Prompt file | Branch it will create | Its worktree | Port |
|---|---|---|---|---|
| 1 | `notes/ws5-sprints/sprint-1-knowledge-schema.md` | `ws5/sprint-1-knowledge-schema` | `../Track-Inspect-worktrees/ws5-sprint-1` | 3501 |
| 2 | `notes/ws5-sprints/sprint-2-synthesis-workmap.md` | `ws5/sprint-2-synthesis-workmap` | `../Track-Inspect-worktrees/ws5-sprint-2` | 3502 |
| 3 | `notes/ws5-sprints/sprint-3-tutor-evaluation.md` | `ws5/sprint-3-tutor-evaluation` | `../Track-Inspect-worktrees/ws5-sprint-3` | 3503 |
| 4 | `notes/ws5-sprints/sprint-4-voice-assessment.md` | `ws5/sprint-4-voice-assessment` | `../Track-Inspect-worktrees/ws5-sprint-4` | 3504 |

Run them **in order**, one at a time. Within a sprint the agent may run parallel lanes itself.

---

## 3. Start the agent

1. Open a **new** terminal and `cd` into the repo root (`<repo>`). Do **not** start it inside another agent's worktree (`.claude/worktrees/…` or `../Track-Inspect-worktrees/…`).
2. Start a fresh Claude Code session (`claude`). A fresh session has no leftover context from other workstreams.
3. Paste the kickoff message below as the **first message**, with `N` and the file name filled in.

### Kickoff message (copy, fill in N, paste)

```text
You are the WS5 Sprint N agent. Your complete instructions are in
notes/ws5-sprints/sprint-N-<slug>.md. Read that whole file now and follow it exactly;
it wins over anything else except what I tell you directly.

Other agents are working in this repository at the same time. Before you change anything:
1. Do the worktree setup in section A6 of that file. Create YOUR OWN worktree at
   /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws5-sprint-N
   on the new branch ws5/sprint-N-<slug>, branched from voice.
2. Prove isolation and show me the output of:
     pwd
     git rev-parse --show-toplevel
     git branch --show-current
     git worktree list
   pwd and show-toplevel must be your worktree path; the branch must be ws5/sprint-N-<slug>.
3. Run the "Checks after setup" from A6 and report the results.
Then stop and wait for my "go".

Hard rules for the whole session:
- Never edit, create or delete files in the main checkout
  (/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation) or in any other worktree.
- Never run git checkout/switch/reset/stash/clean/rebase/merge/pull there.
- Use `git -C <your worktree>` or run git from inside your worktree; re-check
  `git rev-parse --show-toplevel` before every commit.
- Only edit WS5 paths (web/lib/knowledge/, web/fixtures/ws5/, agents/tutor/,
  notes/ws5-sprints/, specs/*-ws5-*). Anything else must be justified in your handoff.
- Do not merge, push, or remove your worktree. I do that after the human gate.
```

4. Check the isolation output yourself (section 5), then reply **go**.

**Alternative, if you prefer not to paste a long message:** paste the whole sprint prompt file instead. It has the same rules in A6. The kickoff message is shorter and adds an explicit stop-and-prove step before any work starts.

---

## 4. Which files give the agent the relevant context

The sprint prompt is self-contained: it tells the agent what to read. For reference, this is the reading order it follows:

| Order | File(s) | Why |
|---|---|---|
| 1 | `notes/ws5-sprints/sprint-N-*.md` | The task: scope, acceptance criteria, human gate, shared rules (A1–A8) |
| 2 | `notes/05-knowledge-newcomer-tutor.md` | The WS5 brief (sections named in the prompt) |
| 3 | `notes/ws5-sprints/sprint-plan.md` | Decisions, dependencies, open decisions (e.g. D1) |
| 4 | `notes/ws5-sprints/handoff-sprint-(N-1).md` | What the previous WS5 sprint delivered, deviations, notes for this sprint |
| 5 | `notes/ws5-sprints/knowledge-schema-v0.md` (Sprint 2+) | The WS5 schema contract |
| 6 | Partner material named in "Read first": WS3 `notes/ws3-sprints/` + `web/lib/expert/`; WS6 `notes/ws6-sprints/` + `web/lib/contracts/`, `web/lib/backend/`; WS7 `notes/ws7-sprints/`; WS4 `notes/04-prototype-data-scenarios.md` | Interfaces we must match, not fork |
| 7 | Partner handoffs: `notes/ws3-sprints/handoff-*`, `notes/ws6-sprints/handoff-*`, `notes/ws7-sprints/handoff-*` | Look for "Requests to partner workstreams" addressed to WS5 |
| 8 | `notes/project-brief.md` | Only if overall context is unclear |

If you have extra context the agent should know (a decision made in a meeting, a changed interface), add it **after** the kickoff message, or write it into `sprint-plan.md` before starting the agent.

---

## 5. How to verify the agent stays in its worktree

**Right after setup** (the kickoff makes the agent print these):
- `pwd` and `git rev-parse --show-toplevel` → `/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws5-sprint-N`
- `git branch --show-current` → `ws5/sprint-N-<slug>`
- `git worktree list` → a new line for `ws5-sprint-N`; all other worktrees unchanged

**During the sprint**, from any terminal:
```bash
git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation status --short   # main checkout: no new changes from the WS5 agent
git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation log --oneline -3 voice   # no WS5 commits appear on voice
git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws5-sprint-N log --oneline -5   # WS5 commits land here
```

**Red flags, stop the agent immediately:**
- It runs `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation` and then edits files or runs git there.
- It runs `git checkout`, `git stash`, `git reset` or `git merge` anywhere other than its own worktree.
- It edits `web/lib/expert/`, `web/lib/backend/`, `web/lib/contracts/`, `web/app/` (other than the Sprint 4 dev harness), or another workstream's notes.
- It runs `npm run sync-agents` without `-- --agent tutor`.

If that happens: interrupt, tell it which rule it broke, and check `git -C <repo> status` for stray changes before anyone else commits.

---

## 6. After the agent finishes

1. Read `notes/ws5-sprints/handoff-sprint-N.md` **in the agent's worktree**: delivered files, verification output, deviations, requests to partners.
2. Run the **human gate** from the sprint prompt, from the agent's worktree (e.g. `cd ../Track-Inspect-worktrees/ws5-sprint-N/web && npm run dev -- -p 350N`).
3. If satisfied, merge from the main checkout at a moment when no other agent is committing:
   ```bash
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation status --short   # must be clean
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff ws5/sprint-N-<slug>
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws5-sprint-N
   ```
4. Forward any "Requests to partner workstreams" from the handoff to the WS3, WS4, WS6 or WS7 owners.
5. Start the next sprint (back to section 1).

---

## 7. Troubleshooting

| Situation | What to do |
|---|---|
| The agent says `notes/ws5-sprints/` is missing in its worktree | The prompts aren't merged into `voice` yet. Stop it, merge, remove its worktree, restart. |
| A worktree or branch `ws5-sprint-N` already exists | A previous attempt is still around. Inspect it (`git -C <that worktree> log`, `status`). Remove it only if its work is no longer needed. |
| A prerequisite from another workstream is missing | Either wait, or tell the agent "proceed against the documented interface with labelled stubs and list it in the handoff". |
| The merge into `voice` conflicts | Usually a shared file (`web/package.json`, `agents/manifest.json`, `agents/probes.json`). Resolve it keeping both sides; never drop another workstream's entries. |
| The agent wants to change a partner's file | It must not. Have it write the request in its handoff and forward it to that workstream's owner. |
