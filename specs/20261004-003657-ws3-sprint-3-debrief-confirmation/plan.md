# Implementation Plan: WS3 Sprint 3 — debrief & confirmation

**Branch**: `worktree-ws03-sprint-3` | **Spec**: [spec.md](spec.md)

## Summary
Pure, test-first modules handle coverage, gaps, drafts, revisions and confirmations. They are wired into the existing session reducer and exposed to the voice agent as client tools. The live phase from Sprint 2 stays unchanged, and its release tick is gated to `phase === "live"`.

## Technical Context
- TypeScript strict, Next.js 16 / React 19, vitest 4.1. No new dependencies.
- Storage: local files behind `ExpertSessionStore`, extended with revisions, confirmations and the knowledge draft.
- Testing: vitest unit tests, plus an end-to-end fixture-session test (`debrief-run.test.ts`) and text probes against the live expert agent.
- Constraints: never invent ElevenLabs API surface. Client tools with `expectsResponse` are VERIFIED (capabilities doc Q2). Phase switching via a contextual update is DOCUMENTED-ONLY, so the tool result also carries the phase text.

## Constitution Check
- **I. Expert is the source of truth:** agenda descriptions use templates without interpretation. Draft text is labeled as AI synthesis.
- **II. Verbatim:** quotes are checked against linked answer lines, and coverage notes are stored apart from those lines.
- **III. Evidence:** every step needs both an event and an exchange; otherwise it is flagged unsupported.
- **IV. Time:** no change.
- **V. Fixtures:** labels are carried into `knowledge-draft.md`.
- **VI. Off-record:** off-record topics are excluded from gaps. Full exclusion is Sprint 4.
- **VII. Verifiable increments:** tests and probes.
- **VIII. Simplicity:** hand-written validators, pure functions.

PASS.

## Project Structure (new / changed)
```
web/lib/expert/coverage.ts        grid, applyCoverage (monotonic), selectGaps, openQuestionsFromTopics
web/lib/expert/draft.ts           proposal validation, quote check, buildRevision, diff, stepsToTeach, stepVerification
web/lib/expert/synthesis.ts       Synthesis interface {getGaps, buildDraft} + defaultSynthesis (WS5 swap point)
web/lib/expert/debrief.ts         reducer helpers: startDebrief, recordCoverage, proposeDraft, confirmRevision, teach-back exchange
web/lib/expert/session.ts         phase-aware begin_question, new actions, session_ended → incomplete
web/lib/expert/context-update.ts  [PHASE debrief] / [TEACH_BACK rev-n] / control nudges
web/lib/expert/knowledge-render.ts revision md, knowledge-draft.md
web/lib/expert/store.ts, render.ts, timing.ts, contracts.ts   persistence, exchanges.md, counters, types/validators
web/components/expert/*           tools, phase controls, coverage grid, agenda, revisions, confirmations
agents/expert/{system-prompt.md,tools.json}, agents/probes(.example).json, web/scripts/probe-agents.mts
```

## Phase 0 / 1
See [research.md](research.md), [data-model.md](data-model.md), [contracts/agent-tools.md](contracts/agent-tools.md) and [quickstart.md](quickstart.md).
