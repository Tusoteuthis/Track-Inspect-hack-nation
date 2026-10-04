# Tasks: WS3 Sprint 3 — debrief & confirmation

TDD: each logic task writes its vitest file first.

## Phase 1: Setup
- [X] T001 Spec artifacts in specs/20261004-003657-ws3-sprint-3-debrief-confirmation/

## Phase 2: Foundational
- [X] T002 Contract types, validators and snapshot cross-checks in web/lib/expert/contracts.ts (+ contracts.snapshot.test.ts)

## Phase 3: US1 Debrief
- [X] T003 [US1] Test-first: coverage grid, monotonic applyCoverage, selectGaps (excludes covered/asked, deferred → open question, priority) in web/lib/expert/coverage.ts + coverage.test.ts
- [X] T004 [US1] Reducer: phase, signal_task_complete/debrief_started, begin_question phase/gap_id, record_coverage, unknown_escalate in web/lib/expert/debrief.ts + session.ts (+ debrief.test.ts)
- [X] T005 [US1] [PHASE debrief] block and control nudges in web/lib/expert/context-update.ts
- [X] T006 [US1] Debrief counters in web/lib/expert/timing.ts

## Phase 4: US2 Teach-back revisions
- [X] T007 [US2] Test-first: proposal validation, quote check, unsupported flag, stable step ids, diff, stepsToTeach, fallback draft in web/lib/expert/draft.ts + draft.test.ts
- [X] T008 [US2] synthesis interface getGaps/buildDraft in web/lib/expert/synthesis.ts
- [X] T009 [US2] propose_draft action + teach-back exchange + [TEACH_BACK rev-n] block in web/lib/expert/debrief.ts

## Phase 5: US3 Correction & confirmation
- [X] T010 [US3] confirm_revision (stale, explicit response, corrected → rev-n+1 with change_exchange_ids), session_ended → incomplete in web/lib/expert/debrief.ts
- [X] T011 [US3] Persistence: revisions/rev-n.json|md (immutable), confirmations.json, knowledge-draft.md, exchanges.md in web/lib/expert/store.ts, knowledge-render.ts, render.ts
- [X] T012 [US3] End-to-end fixture session in web/lib/expert/debrief-run.test.ts

## Phase 6: US4 Console + agent
- [X] T013 [US4] Client tools + phase controls in web/components/expert/useExpertSession.ts; console panels in web/components/expert/ExpertConsole.tsx
- [X] T014 [US4] Agent prompt + tools in agents/expert/system-prompt.md, agents/expert/tools.json
- [X] T015 [US4] Probe harness (requireTools, forbidTools, allowedGapIds, endsWithQuestion, mocks) in web/scripts/probe-agents.mts; 5+ cases in agents/probes(.example).json; wording test in web/lib/expert/probes.test.ts

## Phase 7: Polish
- [ ] T016 sync-agents + probes ×5; contracts doc notes/ws3-sprints/docs/contracts-v0.md; dev smoke on 3103; handoff notes/ws3-sprints/handoff-sprint-3.md

Dependencies: T002 → T003 → T004 → T007 → T009 → T010 → T011 → T012; T013–T015 after T010.
