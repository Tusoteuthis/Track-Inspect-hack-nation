# WS7 sprint prompts: paste-ready agent instructions

Each `sprint-N-*.md` file is a **self-contained prompt**. Start a fresh coding agent in the repo root and paste the entire file as its first message.

- Each file has the sprint-specific instructions at the top and the shared project context (sections B1–B8) at the bottom.
- The shared context is identical in every file, so no agent depends on another agent's conversation.

Overview and estimates: [`../07a-ws7-sprint-plan.md`](../07a-ws7-sprint-plan.md). Source brief: [`../07-frontend-user-experience.md`](../07-frontend-user-experience.md).

| Order | File | Delivers | Agent time | Human gate |
|---|---|---|---|---|
| 0 | `sprint-0-shell-contracts-viewer.md` | Routes, UI contracts, `DataSource` + labelled fixtures, EvidenceViewer, test setup | ~1.5–2 h | ~15 min: legibility through the glasses; share contracts |
| 1 | `sprint-1-work-map-review.md` | Clickable Work Map with evidence; debrief/review view with revisions | ~2–3 h | ~20 min: walk the map |
| 2 | `sprint-2-practice-presave.md` | Practice screen, pre-save review state machine, tutor voice, screen observation | ~3–4 h | ~30 min: wrong draft caught → corrected → saved |
| 3 | `sprint-3-expert-companion.md` | Session setup, expert companion, acknowledged off-record/pause/stop | ~2–3 h | ~20 min: live glasses session |
| 4 | `sprint-4-summary-integration.md` | Learning summary, trust controls, `apiSource` (WS6), demo guide | ~2 h | ~30 min: full demo run-through |

## Rules for running them

- **Order:**
  - S0 comes first.
  - **S1 and S2 may run in parallel** after S0 is merged, because they touch disjoint routes.
  - S3 needs WS3 Sprint 1 merged into `voice`.
  - S4 comes last.
- **Each agent works in its own git worktree** (`.claude/worktrees/ws7-sprint-N`). Other workstream agents work on this repo at the same time.
- **Agents do not merge or push.** After an agent reports done, run the human gate at the end of its sprint section, then merge its branch into `voice` yourself.
- **Handoff notes** (`handoff-sprint-N.md`) are written into this folder by each agent. They hold:
  - verification output
  - decisions
  - contract changes
  - the needs to forward to WS5/WS6
  - the gate checklist
- **Before S2/S3 live gates:** `web/.env` must contain `ELEVENLABS_API_KEY` plus the expert and tutor agent IDs.
- **Verified findings beat the prompt.** If an agent's findings contradict a prompt (for example, a browser or ElevenLabs capability doesn't exist), the agent follows the verified finding and records the deviation in its handoff. Read "Decisions made" before merging.
