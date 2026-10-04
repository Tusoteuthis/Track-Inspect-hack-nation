# WS3 Sprint Plan: ElevenLabs Expert Interaction

**Derived from:** [03-elevenlabs-expert-interaction.md](../03-elevenlabs-expert-interaction.md)  
**Updated:** 3 October 2026  
**Execution:** coding agents (spec-kit feature per sprint, parallel lanes in worktrees), with human live-voice gates.

## Context

`notes/03-elevenlabs-expert-interaction.md` describes the full expert-conversation workstream: live questions grounded in pointing events, pause-aware timing, debrief over coverage gaps, teach-back, revision-tied confirmation, corrections, off-record handling, and evidence-linked records for WS5. The question is whether to build it in one go or split it, given that **implementation will be done by coding agents**.

**Verdict: split into a short Sprint 0 + 4 vertical sprints.** Not because of code volume (agents produce the ~2–3k LOC quickly) but because:
1. Three features carry design/behavioral risk (event↔answer linkage, pause timing, revisioned confirmation) and must be proven before later work builds on them.
2. Two features depend on unverified ElevenLabs capabilities (turn-taking control, data retention for off-record) — a research spike must come first or agents will build on hallucinated APIs.
3. Agents need **autonomously checkable** acceptance criteria per unit of work; one giant spec produces one giant unverifiable diff.

### What already exists (branch `voice`, reuse — don't rebuild)
- `web/app/api/conversation-token/route.ts` — WebRTC token issuance per flow.
- `web/components/voice/VoiceSession.tsx` — session UI, transcript, `clientTools` + `dynamicVariables` props, children can call `sendContextualUpdate`.
- `web/lib/voice/transcript.ts` — final/tentative line handling with `at` timestamps; `web/lib/voice/flows.ts` — expert/tutor flows.
- `web/scripts/sync-agents.mts` — pushes system prompt / first message / docs from `agents/manifest.json` to ElevenLabs.
- `web/scripts/probe-agents.mts` — **text-only agent testing via `simulateConversation`, prints tool calls** → the key autonomous verification harness for agent behavior.
- `web/scripts/tts-roundtrip.mts` — TTS → Scribe round trip; can synthesize "expert" audio for tests.
- No test runner, no agent prompt files, no domain records, no persistence yet.

## Estimation model for agent execution

Effort is driven by **how a feature can be verified**, not by size:

| Mode | Meaning | Agent autonomy |
|---|---|---|
| **V1 – unit** | Pure logic tested with fixtures (vitest) | Fully autonomous, deterministic |
| **V2 – probe** | Agent prompt/tool behavior checked via `npm run probe` simulated conversations | Autonomous but nondeterministic → needs N-run pass-rate threshold |
| **V3 – live** | Real voice, real timing, real feel | **Human gate** (~20–30 min live session per sprint) |
| **EXT** | Depends on ElevenLabs capability or other workstream contract | Research/verification before build; may need human decision |

Feature classification:

| Feature | Verify | Risk |
|---|---|---|
| Records/types + fixtures, persistence routes | V1 | Low |
| Exchange linker (question ↔ event ↔ answer lines) | V1 + V2 | **High (design)** |
| Topic queue, gesture dedup, ambiguity, staleness | V1 | Medium |
| Expert agent prompt + client tools | V2 + V3 | Medium (iteration) |
| Pause-aware asking, timing log | EXT + V3 | **High (platform)** |
| Coverage tracking + debrief gap selection | V1 + V2 | Medium |
| Teach-back, draft revisions, correction, confirmation | V1 + V2 + V3 | **High (design)** |
| Off-record | EXT + V1 | Medium–high (retention on ElevenLabs side) |
| Session completion, demo transcript/timing export | V1 | Low |
| WS5 reusable voice interface doc | — | Low |

## Sprint plan

Each sprint = one spec-kit feature (`/speckit-specify → plan → tasks → implement`), executed in a worktree, ending with a code review and a human live-voice gate. Within a sprint, lanes A/B/C run as parallel subagents once contracts are fixed.

### Sprint 0 — Spike & contracts (agent ~1–1.5h, human ~15 min) — ✅ DONE (2026-10-04)
- **Status:** agent work complete, live spike run (text-only), 19 tests green. Handoff: `notes/ws3-sprints/handoff-sprint-0.md`. Remaining human items: approve the mechanisms, share contracts-v0, merge into `voice`.
- **Research agent** verifies against current ElevenLabs docs/SDK (`@elevenlabs/react` 1.16, `elevenlabs-js` 2.70): client tools in `simulateConversation`; `sendContextualUpdate` semantics (does it ever trigger a turn?); turn-taking settings (turn eagerness/timeout); whether client-tool calls carry timestamps; conversation transcript time offsets; data-retention / zero-retention options. Output: `notes/ws3-sprints/docs/elevenlabs-capabilities.md` with sourced findings.
- Fill `.specify/memory/constitution.md` (fixtures labeled, expert words never synthesized, session time ≠ signal time, no answer key in agent).
- Add vitest to `web/`; define v0 types in `web/lib/expert/contracts.ts` (PointingEvent, ExpertExchange, OpenQuestion, DraftRevision, ExpertConfirmation, SessionCompletion) + fixtures in `web/fixtures/` (3–4 pointing events incl. one ambiguous, one repeat).
- **Human gate:** approve capability findings and share contracts with WS2/WS5/WS6.

### Sprint 1 — Golden path: point → question → answer → saved evidence (agent ~2–3h, human ~30 min) — ✅ DONE (2026-10-04)
- **Status:** agent work complete. 103 tests green; expert agent created and synced (`begin_question` tool, `skip_turn` on); probes 5/5 on all five cases; snapshot route writes all six files. Branched from Sprint 0 (not yet merged into `voice`). Handoff: `notes/ws3-sprints/handoff-sprint-1.md`. Remaining human items: live voice gate, merge into `voice` (brings Sprint 0 along), copy the expert agent id into the main checkout's `web/.env`.
- Lane A (V1): session store + **exchange linker** reducer (agent calls `begin_question(event_id, question, kind)` tool → subsequent user final lines attach to that exchange until next question; answers keep original event even if new events arrive); persistence routes writing `knowledge/sessions/<id>/{exchanges.json, transcript.md, events/}`; timing log (event received / question ready / speech onset).
- Lane B (V2): `agents/expert/system-prompt.md`, first message, tool definitions; manifest wiring; probe cases (asks about the event, doesn't lead, one question at a time, calls the tool).
- Lane C: replace dev `ContextSender` with fixture event injector; wire client tools into `VoiceSession` on the expert flow.
- **Done when:** unit tests pass, probe pass-rate ≥ 4/5 per case, and a human completes one live point→question→answer with a saved, correctly linked record.

### Sprint 2 — Live interview quality (agent ~2–3h, human ~30 min) — 🟡 AGENT DONE, human gate pending
- **Status:** merged into `voice` on 2026-10-04 (via the Sprint 4 branch, which stacks 2→3→4). Human voice gate still open; see `notes/ws3-sprints/handoff-sprint-2.md`.
- Topic queue: dedup repeated gestures (same region/time window), ambiguity → clarification question, stale reference → refer to the preserved moment (V1).
- Pause-aware asking per Sprint 0 findings: queue events while expert speaks, release as contextual update at pause; tag questions `live` vs `debrief`, `guardrail` flag (V1 + V2).
- Timing report separating processing latency from intentional wait (V1).
- **Done when:** fixture script yields ≥3 live questions incl. 1 guardrail, zero duplicates; human live session confirms no interruptions mid-speech.

### Sprint 3 — Debrief, teach-back, confirmation (agent ~3–4h, human ~45 min) — 🟡 AGENT DONE, human gate pending
- **Status:** merged into `voice` on 2026-10-04 (via the Sprint 4 branch, which stacks 2→3→4). Human voice gate still open; see `notes/ws3-sprints/handoff-sprint-3.md`.
- Coverage record (decision, reason, cues, alternatives, guardrails, unresolved) filled via agent tool `record_coverage` (V1 + V2); in-memory stand-in for WS5 behind an interface WS5 can replace.
- Completion signal → debrief phase → ≥3 gap questions not already answered (V2).
- Draft revisions (`rev-n`), teach-back delivered from the current revision, correction → new revision → re-check, `confirm_revision(rev, status)` tool; silence ≠ confirmation (V1 + V2).
- **Done when:** probes show debrief questions only target gaps; a correction in a live session produces a new confirmed revision that reflects it.

### Sprint 4 — Trust, completion, handoff (agent ~1.5–2h, human ~20 min) — 🟡 AGENT DONE, human gate pending
- **Status:** merged into `voice` on 2026-10-04 (via the Sprint 4 branch, which stacks 2→3→4). Human voice gate still open; see `notes/ws3-sprints/handoff-sprint-4.md`.
- Off-record: voice command + UI toggle; exclude lines/exchanges locally; apply retention setting found in Sprint 0 or document the limit explicitly (V1 + EXT).
- Incomplete session handling + SessionCompletion record; demo transcript + timing export (V1).
- `notes/ws3-sprints/docs/voice-interface.md` for WS5 tutor reuse.
- **Done when:** off-record segment absent from all persisted files; exported demo evidence shows required counts.

### Sprint 5 — Strategy alignment: bounded questioning & expert control (agent ~3–4h, human ~30 min)
- Aligns the agent with `notes/voice-agent-strategy-handoff.md`, following the user decisions D1–D11 recorded in `sprint-5-strategy-alignment.md`:
  - a fixed 5-question live cap and ≤ 1 follow-up per topic, both enforced in `begin_question`
  - 'just listen' / 'skip that' / 'next'
  - an orientation step of ≤ 2 questions
  - a debrief of 3 questions and a teach-back with 1 correction pass
  - a conditional question bank in the prompt, and §15 rehearsal probes

## Totals
- **Agent wall-clock:** ~10–14h across sprints (lanes parallel within a sprint; sprints sequential because each de-risks the next).
- **Human time:** ~2.5h total — mostly 4 live voice gates + contract sign-offs. The live gates are the real critical path; agents cannot judge conversational feel or real pause behavior.
- **Biggest schedule risk:** Sprint 0 finding that ElevenLabs gives little control over turn-taking → Sprint 2 falls back to prompt-level restraint + documented limitation.

## Assumptions (change at approval if wrong)
- spec-kit per sprint (repo is already set up for it).
- Persistence = local files via Next.js route handlers under `knowledge/sessions/`, handed to WS6 later.
- Real glasses/iPhone audio route stays WS2's integration task; WS3 develops on browser mic + fixture events, clearly labeled.

## Verification (per sprint)
- `cd web && npm run typecheck && npx vitest run`
- `npm run sync-agents -- --agent expert && npm run probe -- expert` (repeat N=5, check pass rate + tool calls)
- `npm run dev` → live session on the expert flow with fixture events; inspect `knowledge/sessions/<id>/` for linked records.


## Paste-ready agent prompts

One self-contained prompt per sprint lives in [this folder](README.md). Run them in order, with a human gate and a merge into `voice` between sprints.
