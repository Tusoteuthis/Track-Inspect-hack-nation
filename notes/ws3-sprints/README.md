# WS3 sprint prompts: paste-ready agent instructions

Each `sprint-N-*.md` file is a **self-contained prompt**. Start a fresh coding agent in the repo root and paste the entire file as its first message. Each file has the sprint-specific instructions at the top and the shared project context (sections A1–A8) at the bottom. The shared context is identical in every file, so no agent depends on another agent's conversation.

Overview and estimates: [`../03a-ws3-sprint-plan.md`](../03a-ws3-sprint-plan.md). Source brief: [`../03-elevenlabs-expert-interaction.md`](../03-elevenlabs-expert-interaction.md).

| Order | File | Delivers | Agent time | Human gate |
|---|---|---|---|---|
| 0 | `sprint-0-spike-contracts.md` | ElevenLabs capability findings, constitution, v0 contracts and fixtures, vitest | ~1–1.5 h | ~15 min: accept mechanisms, share contracts |
| 1 | `sprint-1-golden-path.md` | point → question → answer → saved, correctly linked evidence | ~2–3 h | ~30 min live voice |
| 2 | `sprint-2-live-interview.md` | topic queue, dedup, ambiguity, pause-aware asking, timing report | ~2–3 h | ~30 min live voice |
| 3 | `sprint-3-debrief-confirmation.md` | coverage, debrief, revisioned teach-back, correction, confirmation | ~3–4 h | ~45 min live voice |
| 4 | `sprint-4-trust-completion.md` | off-record, completion, demo evidence, WS5/WS6/WS7 handoff docs | ~1.5–2 h | ~20 min live voice |

## Worktree setup (several agents work in this repo in parallel)

Every sprint agent works in **its own git worktree**, never in the shared main checkout. Section A6 of each prompt has the exact setup commands and hard rules (no checkout, reset, stash or merge in the main checkout; separate dev-server ports; spec-kit `--timestamp` naming to avoid `specs/NNN` collisions with other workstreams).

| Sprint | Branch | Worktree | Dev port |
|---|---|---|---|
| 0 | `ws3/sprint-0-spike-contracts` | `../Track-Inspect-worktrees/ws3-sprint-0` | 3100 |
| 1 | `ws3/sprint-1-golden-path` | `../Track-Inspect-worktrees/ws3-sprint-1` | 3101 |
| 2 | `ws3/sprint-2-live-interview` | `../Track-Inspect-worktrees/ws3-sprint-2` | 3102 |
| 3 | `ws3/sprint-3-debrief-confirmation` | `../Track-Inspect-worktrees/ws3-sprint-3` | 3103 |
| 4 | `ws3/sprint-4-trust-completion` | `../Track-Inspect-worktrees/ws3-sprint-4` | 3104 |

**Once, before Sprint 0:** a worktree only contains what is **committed** on `voice`. These are currently untracked in the main checkout and must be committed to `voice` first, or the agents won't have them:
- `notes/03a-ws3-sprint-plan.md`
- `notes/ws3-sprints/`
- `.specify/`
- `.claude/skills/speckit-*`

`web/.env` is gitignored; each agent copies it from the main checkout during setup.

**After each sprint's human gate (done by you):**

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
git -C "$REPO" status                      # must be clean, with no other agent mid-commit
git -C "$REPO" merge --no-ff ws3/sprint-N-<slug>
git -C "$REPO" worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-N
```

The next sprint's worktree must be created **after** this merge, so it starts from a `voice` that contains the previous sprint.

## Rules for running them

- **Strictly sequential.** Each sprint reads the previous sprint's `handoff-sprint-N.md` and needs the previous branch merged into `voice`. Inside a sprint, the agent may run its lanes in parallel with subagents.
- **The agents do not merge or push.** After an agent reports done, run the human gate listed at the end of its sprint section, then merge its feature branch into `voice` yourself.
- **Handoff notes** (`handoff-sprint-N.md`) are written into this folder by each agent. They hold verification output, decisions, contract changes and the gate checklist.
- **Prerequisite for Sprints 1–4:** `web/.env` with `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID_EXPERT`. Sprint 0 can do most of its research without them.
- If an agent's findings contradict a prompt, for example an ElevenLabs feature that doesn't exist, the agent follows the verified finding and records the deviation in its handoff note. Read the "Decisions made" section before merging.
