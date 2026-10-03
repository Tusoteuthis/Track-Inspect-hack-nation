# Tasks: WS7 S2 practice pre-save

## Phase 1: Setup
- [x] T001 Contracts: add `ReviewStatus`, `PracticeTimelineEntry`, `ScreenFrameRef` and `evaluation_id?` to web/lib/ui/contracts.ts
- [x] T002 DataSource: add the commit options and `submitScreenFrame` to web/lib/data/source.ts
- [x] T003 [P] playwright.config.ts: add optional `PW_PORT`

## Phase 2: Foundational (TDD, pure)
- [x] T010 [P] [US1/US2] reviewMachine.test.ts table, then reviewMachine.ts
- [x] T011 [P] outcomeToReviewState.test.ts, then the adapter
- [x] T012 [P] regionDraw.test.ts, then regionDraw.ts
- [x] T013 [P] timeline.test.ts, then timeline.ts
- [x] T014 [P] [US3] screenCapture.test.ts, then screenCapture.ts
- [x] T015 [P] [US3] contextMessages.test.ts, then contextMessages.ts
- [x] T016 fixturePractice.test.ts, then fixturePractice.ts; wire it into fixtureSource and update fixtureSource.test.ts
- [x] T017 reviewCopy.ts

## Phase 3: US1 + US2 practice screen
- [x] T020 DraftForm, RegionMarker, ReviewStatusPanel, GuidancePanel (with ExampleDialog), PracticeTimeline, practice.module.css
- [x] T021 PracticeScreen (reducer and effects)
- [x] T022 PracticeScreen.test.tsx: the 6 acceptance component tests
- [x] T023 app/practice/page.tsx with fixture controls

## Phase 4: US3 voice and screen
- [x] T030 Spike, then write notes/ws7-screen-observation.md
- [x] T031 useScreenObservation, ScreenSharePanel (+ test)
- [x] T032 TutorPanel (AgentStatus, MicPermission, context bridge) + test

## Phase 5: Polish
- [x] T040 e2e/practice.spec.ts with screenshots
- [x] T041 Run typecheck, vitest, playwright, build and the evaluator grep
- [x] T042 Write handoff-sprint-2.md
