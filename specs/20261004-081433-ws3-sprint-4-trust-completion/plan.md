# Implementation Plan: WS3 Sprint 4 — trust & completion

**Branch**: `worktree-ws03-sprint-4` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

## Summary

Add record-state segments and in-memory exclusion to the session reducer, a retroactive strike, a
derived `SessionCompletion`, a derived `demo-evidence.md`, best-effort resume, and a session-scoped
ElevenLabs conversation deletion route. Agent gets two client tools (`set_record_state`,
`strike_last_answer`). Docs: `voice-interface.md`, `trust.md`, contracts → `ws3.v1`.

## Technical Context

- **Language**: TypeScript strict, Next.js 16 / React 19 (`web/`), vitest.
- **Dependencies**: `@elevenlabs/react` 1.16 (`useConversationInput().setMuted`, `sendUserActivity`), `@elevenlabs/elevenlabs-js` 2.70 (`conversationalAi.conversations.delete`).
- **Storage**: local files under `knowledge/sessions/<id>/` via `ExpertSessionStore`.
- **Testing**: vitest (pure reducer + store + route with mocked SDK); `npm run probe` for agent behavior.
- **Constraints**: no change to shared agent privacy settings; deletion only of ids stored in that session.

## Constitution Check

| Principle | Status |
|---|---|
| I Expert source of truth | unchanged; off-record/strike prompts forbid referring to excluded content |
| II Verbatim | struck words removed, never paraphrased into records; redaction markers are labeled |
| III Evidence linkage | struck exchange kept as an id shell, so links stay valid; steps relying on it become unsupported |
| IV Time | segments use wall-clock UTC only |
| V Fixtures | demo evidence lists live vs fixture |
| VI Trust | core of this sprint; ElevenLabs retention limits stated explicitly in `trust.md` |
| VII Verifiable | TDD for all new pure modules; probes 5× |
| VIII Simplicity | new pure modules + 2 thin routes; store interface extended (load, extra files) |

Gate: PASS (no violations).

## Project Structure (new / changed)

```
web/lib/expert/record-state.ts      segments, phrase detection, off/on transitions, in-segment checks, leak check
web/lib/expert/strike.ts            strike_last_answer reducer step + redaction
web/lib/expert/completion.ts        deriveCompletion, renderCompletionMd
web/lib/expert/demo-evidence.ts     demoChecklist, renderDemoEvidenceMd
web/lib/expert/resume.ts            resumeSummary
web/lib/expert/elevenlabs-deletion.ts  deleteSessionConversations (SDK injected)
web/lib/expert/{contracts,session,debrief,draft,store,timing,render,knowledge-render,context-update}.ts  extended
web/app/api/expert-sessions/[sessionId]/elevenlabs-deletion/route.ts   POST
web/app/api/expert-sessions/[sessionId]/demo-evidence/route.ts         POST (re-derive from disk)
web/components/expert/{useExpertSession.ts,ExpertConsole.tsx}, web/components/voice/VoiceSession.tsx (onStop/onError props)
agents/expert/{system-prompt.md,tools.json}, agents/probes(.example).json, web/scripts/probe-agents.mts (case-level toolMocks)
notes/ws3-sprints/docs/{voice-interface.md,trust.md,contracts-v0.md}
```

## Complexity Tracking

None.
