# Tasks: WS7 S2 practice pre-save

## Phase 1: Setup
- [ ] T001 Contracts: add `ReviewStatus`, `PracticeTimelineEntry`, `ScreenFrameRef` and `evaluation_id?` to web/lib/ui/contracts.ts
- [ ] T002 DataSource: add the commit options and `submitScreenFrame` to web/lib/data/source.ts
- [ ] T003 [P] playwright.config.ts: add optional `PW_PORT`

## Phase 2: Foundational (TDD, pure)
- [ ] T010 [P] [US1/US2] reviewMachine.test.ts table, then reviewMachine.ts
- [ ] T011 [P] outcomeToReviewState.test.ts, then the adapter
- [ ] T012 [P] regionDraw.test.ts, then regionDraw.ts
- [ ] T013 [P] timeline.test.ts, then timeline.ts
- [ ] T014 [P] [US3] screenCapture.test.ts, then screenCapture.ts
- [ ] T015 [P] [US3] contextMessages.test.ts, then contextMessages.ts
- [ ] T016 fixturePractice.test.ts, then fixturePractice.ts; wire it into fixtureSource and update fixtureSource.test.ts
- [ ] T017 reviewCopy.ts

## Phase 3: US1 + US2 practice screen
- [ ] T020 DraftForm, RegionMarker, ReviewStatusPanel, GuidancePanel (with ExampleDialog), PracticeTimeline, practice.module.css
- [ ] T021 PracticeScreen (reducer and effects)
- [ ] T022 PracticeScreen.test.tsx: the 6 acceptance component tests
- [ ] T023 app/practice/page.tsx with fixture controls

## Phase 4: US3 voice and screen
- [ ] T030 Spike, then write notes/ws7-screen-observation.md
- [ ] T031 useScreenObservation, ScreenSharePanel (+ test)
- [ ] T032 TutorPanel (AgentStatus, MicPermission, context bridge) + test

## Phase 5: Polish
- [ ] T040 e2e/practice.spec.ts with screenshots
- [ ] T041 Run typecheck, vitest, playwright, build and the evaluator grep
- [ ] T042 Write handoff-sprint-2.md
