# WS5 sprint prompts: paste-ready agent instructions

Everything for WS5 (knowledge & newcomer tutor) lives in this folder. The source brief stays at [`../05-knowledge-newcomer-tutor.md`](../05-knowledge-newcomer-tutor.md) next to the other workstream briefs.

**Starting an agent? Read [`HOW-TO-START-AN-AGENT.md`](HOW-TO-START-AN-AGENT.md) first.** It has the kickoff message, the context files, and how to keep the agent in its own worktree.

| File | Purpose |
|---|---|
| [`HOW-TO-START-AN-AGENT.md`](HOW-TO-START-AN-AGENT.md) | Human guide: pre-flight checks, kickoff message, reading order, isolation checks, merge and cleanup |
| [`sprint-plan.md`](sprint-plan.md) | Why the work is split, decisions, sprint table, sync points with WS3/WS4/WS6/WS7, open decisions |
| `sprint-N-*.md` | One **self-contained prompt** per sprint. Create the sprint's worktree, start a fresh coding agent **inside it**, and paste the whole file (or the short kickoff from the guide) as its first message. Sprint-specific instructions come first; the shared WS5 context (A1–A8) follows and is identical in every file. |
| `handoff-sprint-N.md` | Written by each sprint's agent (Sprint 1: present) |
| `docs/knowledge-schema-v0.md` | Written by Sprint 1: the schema doc for partner workstreams |

| Order | File | Delivers | Agent time | Human gate |
|---|---|---|---|---|
| 1 ✅ done | `sprint-1-knowledge-schema.md` | Entry schema + Markdown, invariants, status rules, eligibility/pinning, retrieval, fixtures, schema doc | ~1.5–2 h | ~15 min: read the schema, share it with WS3/WS6/WS7 |
| 2 | `sprint-2-synthesis-workmap.md` | Synthesis, revisions on correction, genuine gaps, teach-back, Work Map content, WS3/WS6 adapters | ~2–3 h | ~20 min: workflow reads as a process, gaps are real |
| 3 | `sprint-3-tutor-evaluation.md` | Guarded tutor evaluator, intervention with verbatim citations, anti-cheating tests, timeline | ~3–4 h | ~25 min: wrong draft caught, uncovered case escalated |
| 4 | `sprint-4-voice-assessment.md` | Tutor voice agent + probes, screen-context contract, assessment, trust propagation, end-to-end | ~3 h | ~30 min live: full newcomer run |

## Worktrees, branches, ports

Shared rules for all workstreams (integration branch, port registry, `.env`, stash): [`../WORKTREES.md`](../WORKTREES.md).

Every sprint agent works in **its own git worktree**, never in the shared main checkout. The worktrees sit in the shared `<repo>/.claude/worktrees/` folder next to the other workstreams' (`ws03-…`, `ws06-…`, `ws07-…`), with the same naming: folder `ws05-sprint-N`, branch `worktree-ws05-sprint-N`. `<repo>` = `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`. The human creates the worktree and launches the agent inside it (see the guide). Section A6 of each prompt has the exact setup commands and hard rules: no checkout, reset, stash or merge in the main checkout; only WS5 paths; spec-kit `--timestamp` naming.

| Sprint | Branch | Worktree | Dev port |
|---|---|---|---|
| 1 | `worktree-ws05-sprint-1` | `<repo>/.claude/worktrees/ws05-sprint-1` | 3501 |
| 2 | `worktree-ws05-sprint-2` | `<repo>/.claude/worktrees/ws05-sprint-2` | 3502 |
| 3 | `worktree-ws05-sprint-3` | `<repo>/.claude/worktrees/ws05-sprint-3` | 3503 |
| 4 | `worktree-ws05-sprint-4` | `<repo>/.claude/worktrees/ws05-sprint-4` | 3504 |

## Rules for running them

- **Sequential.** Each sprint reads the previous `handoff-sprint-N.md` and needs the previous branch merged into `voice`.
- **This folder must be on `voice`** before Sprint 1 starts, since agents branch from `voice`.
- **The agents do not merge or push.** Run the human gate, then merge the sprint branch into `voice` yourself from the main checkout when no other agent is mid-commit.
- **Partners move in parallel.** Before each sprint, check `notes/ws3-sprints/`, `notes/ws6-sprints/` and `notes/ws7-sprints/` handoffs for requests addressed to WS5.
- **Decision D1** (evaluation mechanism / LLM provider) must be made before Sprint 3; record it in `sprint-plan.md`.
- **Prerequisite for Sprint 1:** WS3 Sprint 0 merged (shared constitution, vitest, `web/lib/expert/contracts.ts`).
