# Implementation Plan: WS3 Sprint 1 — Golden path

**Branch**: `worktree-ws03-sprint-1` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-010622-ws3-sprint-1-golden-path/spec.md` (source prompt `notes/ws3-sprints/sprint-1-golden-path.md`).

## Summary

The client tells the agent about each pointing event with a contextual update (`contextId` = event id). The agent declares each question with the client tool `begin_question`, which creates the linked exchange. A pure reducer (`web/lib/expert/session.ts`) owns all linkage rules: answer attachment, the preamble, unlinked questions and timing. A thin React hook wraps the reducer, exposes stable `clientTools` that read the latest state through a ref, and saves idempotent snapshots through `PUT /api/expert-sessions/[sessionId]/snapshot`. That route writes six files atomically through a small store interface. Agent prompt, tool and settings live in `agents/` and are pushed by an extended `sync-agents.mts`. An extended `probe-agents.mts` runs five probe cases N times with automatic assertions.

## Technical Context

**Language/Version**: TypeScript 5 (strict, no `any`), Node 26

**Primary Dependencies**: Next.js 16 App Router, React 19, `@elevenlabs/react` 1.16, `@elevenlabs/elevenlabs-js` 2.70

**Storage**: local files under `<repo>/knowledge/sessions/<id>/` (`KNOWLEDGE_DIR` overrides the location)

**Testing**: vitest 4 (pure logic and store against a tmp dir); `npm run probe` for agent behaviour

**Target Platform**: browser (dev companion page) and the Next.js node runtime

**Project Type**: web app (single Next.js app in `web/`)

**Performance Goals**: the tool result goes back to the LLM synchronously (Sprint 0 measured about 160 ms round trip); saves are debounced by about 1 s

**Constraints**: the `clientTools` object is captured when the session starts, so handlers must read from a ref; the ElevenLabs key stays server-side

**Scale/Scope**: one expert session at a time, tens of events and exchanges

## Constitution Check

| Principle | How this plan complies |
|---|---|
| I Expert is source of truth | The context update has no label and no interpretation. The prompt forbids interpreting and leading questions. Ambiguous or unresolved events are asked about first (`clarify_reference`). Probe cases 3 and 5 check this. |
| II Verbatim evidence | `question` is the agent's spoken final line and `answer_lines` are the user's final lines, both unmodified. The planned question is stored separately in `question_planned`. |
| III Evidence linkage | `event_id` is set only when `begin_question` runs. `event_received` never touches existing exchanges. Unit tests cover both. |
| IV Time discipline | Timing marks carry `at_utc` and `at_perf_ms` and never derive a `signal_interval`. |
| V Fixtures labeled | Injected fixtures keep `source:"fixture"`, and the UI badges them "FIXTURE". |
| VI Trust | The key stays server-side. No answer key is involved. Off-record events are not to be asked about (prompt); full exclusion is Sprint 4 (documented). |
| VII Verifiable increments | TDD for the reducer, formatter, renderers, validators and store. Probes run 5× per case. Human gate. |
| VIII Simplicity | Filesystem store behind `ExpertSessionStore`. Hand-written validators. No new dependencies. |

Gate: **PASS**. The re-check after design is also **PASS**, with no violations.

## Project Structure

### Documentation (this feature)

```text
specs/20261004-010622-ws3-sprint-1-golden-path/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/ (begin-question-tool.md, pointing-event-update.md, snapshot-route.md)
└── tasks.md
```

### Source Code

```text
agents/
├── manifest.json, manifest.example.json      expert: systemPrompt, firstMessage, tools, settings
├── probes.json, probes.example.json          expert cases 1–5
└── expert/ system-prompt.md, first-message.md, tools.json
web/
├── lib/expert/
│   ├── contracts.ts (+ question_planned, new validators)
│   ├── context-update.ts      formatPointingEventUpdate
│   ├── session.ts             pure reducer + helpers
│   ├── render.ts              transcript.md / exchanges.md
│   ├── store.ts               ExpertSessionStore + fs implementation
│   └── fixtures.ts            static fixture list
├── lib/voice/transcript.ts    tentativeTextFrom fix
├── app/api/expert-sessions/[sessionId]/snapshot/route.ts
├── components/expert/ useExpertSession.ts, ExpertConsole.tsx
├── components/voice/VoiceSession.tsx (+ optional onAgentModeChange, onDisconnected)
├── app/page.tsx               expert flow uses ExpertConsole; raw ContextSender behind a toggle
└── scripts/ sync-agents.mts (tools, settings, create from scratch), probe-agents.mts (--runs, assertions)
.gitignore                     + knowledge/sessions/
```

**Structure Decision**: extend the existing single Next.js app. The domain logic goes in `web/lib/expert/` next to the Sprint 0 contracts.

## Complexity Tracking

No constitution violations. Deviations from the sprint prompt (branch base, the `"none"` sentinel, the probe event representation) are recorded in research.md and in the handoff note.
