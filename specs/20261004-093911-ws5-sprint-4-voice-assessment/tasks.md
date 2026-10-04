# Tasks: WS5 Sprint 4

TDD: each module's test is written first and seen failing.

## Phase 1 — Lane B: screen observation (US3)
- [ ] T001 `__tests__/observation.test.ts`: validation, stale filtering, description (no case id), WS6/WS7 mapping
- [ ] T002 `observation.ts`
- [ ] T003 Evaluator adapter uses the described screen context (test in `ws6-tutor-evaluator.test.ts`)

## Phase 2 — Lane A: tutor context blocks (US1)
- [ ] T004 `__tests__/tutor-context.test.ts`: format, guiding question first, verbatim-only, refuses revoked/off-record/uncited, no evaluator material
- [ ] T005 `tutor-context.ts`

## Phase 3 — Lane C: assessment (US2)
- [ ] T006 `__tests__/assessment.test.ts`: three classes, interventions, practice_next derivation, limitations text, transfer, revoked label, markdown never claims mastery, fixture source
- [ ] T007 `assessment.ts` + `renderAssessmentMarkdown`
- [ ] T008 `adapters/ws6-assessment-module.ts` + test

## Phase 4 — Lane D: trust (US4)
- [ ] T009 `__tests__/trust.test.ts`: revocation → selectEligible + knowledge_changed + context block refused; dependents flagged; off-record walk over every output path; assessments/evaluator notes never eligible
- [ ] T010 `trust.ts`

## Phase 5 — Tutor agent (US1)
- [ ] T011 `agents/tutor/system-prompt.md`, `first-message.md`
- [ ] T012 `agents/manifest.json` tutor wiring; `npm run sync-agents -- --agent tutor`
- [ ] T013 Probe checker additive expect fields; five tutor probe cases
- [ ] T014 `npm run probe -- tutor --runs 5` ≥ 4/5 each (iterate on the prompt)

## Phase 6 — E2E (US5)
- [ ] T015 `dev/scenario.ts` (confirm/revoke helpers, scripted judge, commit stand-in) + fixtures `web/fixtures/ws5/e2e/`
- [ ] T016 `dev/e2e-ws5.mts`; run, with `--live-tutor`

## Phase 7 — Docs & handoff
- [ ] T017 `index.ts` exports; schema doc §11
- [ ] T018 typecheck + vitest; handoff-sprint-4.md (§12 mapping); commit
