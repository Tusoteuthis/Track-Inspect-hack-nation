# WS3 sprint prompts: paste-ready agent instructions

Each `sprint-N-*.md` file is a **self-contained prompt**. Start a fresh coding agent **inside its own worktree** (see "Worktree setup" below) and paste the entire file as its first message. Each file has the sprint-specific instructions at the top and the shared project context (sections A1–A8) at the bottom. The shared context is identical in every file, so no agent depends on another agent's conversation.

**Starting an agent? Read [`HOW-TO-START-AN-AGENT.md`](HOW-TO-START-AN-AGENT.md) first.** Overview and estimates: [`sprint-plan.md`](sprint-plan.md). Source brief: [`../03-elevenlabs-expert-interaction.md`](../03-elevenlabs-expert-interaction.md).

| Order | File | Delivers | Agent time | Human gate |
|---|---|---|---|---|
| 0 | `sprint-0-spike-contracts.md` | ElevenLabs capability findings, constitution, v0 contracts and fixtures, vitest | ~1–1.5 h | ~15 min: accept mechanisms, share contracts |
| 1 | `sprint-1-golden-path.md` | point → question → answer → saved, correctly linked evidence | ~2–3 h | ~30 min live voice |
| 2 | `sprint-2-live-interview.md` | topic queue, dedup, ambiguity, pause-aware asking, timing report | ~2–3 h | ~30 min live voice |
| 3 | `sprint-3-debrief-confirmation.md` | coverage, debrief, revisioned teach-back, correction, confirmation | ~3–4 h | ~45 min live voice |
| 4 | `sprint-4-trust-completion.md` | off-record, completion, demo evidence, WS5/WS6/WS7 handoff docs | ~1.5–2 h | ~20 min live voice |
| 5 | `sprint-5-strategy-alignment.md` | bounded questioning per `notes/voice-agent-strategy-handoff.md`: app-enforced budgets, expert controls, orientation, bounded debrief/teach-back | ~3–4 h | ~30 min live voice |

## Worktree setup (several agents work in this repo in parallel)

Every sprint agent works in **its own git worktree**, never in the shared main checkout. Section A6 of each prompt has the exact setup commands and hard rules (no checkout, reset, stash or merge in the main checkout; separate dev-server ports; spec-kit `--timestamp` naming to avoid `specs/NNN` collisions with other workstreams).

| Sprint | Branch | Worktree | Dev port |
|---|---|---|---|
| 0 | `worktree-ws03-sprint-0` | `.claude/worktrees/ws03-sprint-0` | 3100 |
| 1 | `worktree-ws03-sprint-1` | `.claude/worktrees/ws03-sprint-1` | 3101 |
| 2 | `worktree-ws03-sprint-2` | `.claude/worktrees/ws03-sprint-2` | 3102 |
| 3 | `worktree-ws03-sprint-3` | `.claude/worktrees/ws03-sprint-3` | 3103 |
| 4 | `worktree-ws03-sprint-4` | `.claude/worktrees/ws03-sprint-4` | 3104 |
| 5 | `worktree-ws03-sprint-5` | `.claude/worktrees/ws03-sprint-5` | 3105 |

**Start each agent inside its worktree (recommended).** This keeps the agent's whole session out of the shared checkout:

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
N=0; SLUG=spike-contracts            # see the table above
WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-$N
git -C "$REPO" worktree add -b worktree-ws03-sprint-$N "$WT" voice
cp "$REPO/web/.env" "$WT/web/.env"
cd "$WT" && claude                   # then paste notes/ws3-sprints/sprint-$N-$SLUG.md
```

The prompt's first step (A6) detects that the agent is already in the right worktree and skips creating one. If you start the agent in the main checkout instead, it creates the worktree itself and must then use only worktree paths. That works, but relies on the agent following instructions.

**Once, before Sprint 0 (done in commit 6fcd031):** a worktree only contains what is **committed** on `voice`. These had to be committed to `voice` first:
- `notes/ws3-sprints/`
- `.specify/`
- `.claude/skills/speckit-*`

`web/.env` is gitignored; each agent copies it from the main checkout during setup.

**After each sprint's human gate (done by you):**

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
git -C "$REPO" status                      # must be clean, with no other agent mid-commit
git -C "$REPO" merge --no-ff worktree-ws03-sprint-N
git -C "$REPO" worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-N
```

The next sprint's worktree must be created **after** this merge, so it starts from a `voice` that contains the previous sprint.

## Rules for running them

- **Strictly sequential.** Each sprint reads the previous sprint's `handoff-sprint-N.md` and needs the previous branch merged into `voice`. Inside a sprint, the agent may run its lanes in parallel with subagents.
- **The agents do not merge or push.** After an agent reports done, run the human gate listed at the end of its sprint section, then merge its feature branch into `voice` yourself.
- **Handoff notes** (`handoff-sprint-N.md`) are written into this folder by each agent. They hold verification output, decisions, contract changes and the gate checklist.
- **Prerequisite for Sprints 1–4:** `web/.env` with `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID_EXPERT`. Sprint 0 can do most of its research without them.
- If an agent's findings contradict a prompt, for example an ElevenLabs feature that doesn't exist, the agent follows the verified finding and records the deviation in its handoff note. Read the "Decisions made" section before merging.

## Folder layout

Everything WS3 lives in this folder. `sprint-plan.md` is the overview. `sprint-*.md` are the prompts. `handoff-sprint-N.md` files are written by the agents. `docs/` holds the reference docs the sprints produce (ElevenLabs capabilities, contracts, voice interface, trust).
