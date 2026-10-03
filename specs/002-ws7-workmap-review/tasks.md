# Tasks: WS7 Clickable Work Map and Debrief/Review View

**Input**: `specs/002-ws7-workmap-review/` (plan, spec, data-model, contracts, research)
**Tests**: requested (prompt: TDD for reducers, mappers and revision diff; component + Playwright acceptance tests). All paths are under `web/`.

## Phase 1: Setup
- [X] T001 Install dependencies (`npm ci`) and confirm the baseline typecheck/vitest pass in `web/`

## Phase 2: Foundational (blocks all stories)
- [X] T002 Extend `lib/ui/contracts.ts` additively: `revision_label`, `parent_revision_id`, `change_reason` on `WorkMapView`; `ReviewView` (WS3 `OpenQuestion`/`ExpertConfirmation`); `ReviewMark`
- [X] T003 Extend `lib/data/source.ts`: `getReview`, `submitReviewMark`, `SourceUpdate` `"review"`
- [X] T004 Rewrite `fixtures/ui/workmap.json` as Revision 1 (6 items: multi-evidence step, ambiguous decision, guardrail, unresolved exception, revoked guardrail, missing step); add `workmap-rev-2.json`, `workmap-rev-2-confirmed.json`, `review-script.json` (WS3-shaped open questions + confirmations per stage)
- [X] T005 [P] Test-first `lib/ui/status.test.ts` → `lib/ui/status.ts` (icon/label/teachable per status; only confirmed → "Confirmed")
- [X] T006 Test-first `lib/data/fixtureReviewScript.test.ts` → `lib/data/fixtureReviewScript.ts` (stages, advance/reset, listeners, marks with latency + failure toggle)
- [X] T007 Wire the script into `lib/data/fixtureSource.ts` (`getWorkMap` → current stage, `getReview`, `submitReviewMark`, `subscribe`); update `lib/data/fixtureSource.test.ts`

## Phase 3: US1 — Work Map items and evidence (P1)
**Independent test**: select every fixture item; image, region and quotes match the fixture.
- [X] T008 [P] [US1] `components/workmap/StatusBadge.tsx`
- [X] T009 [US1] `components/workmap/WorkMapDetail.tsx` + `workmap.module.css` (evidence selector + EvidenceViewer focus, "Expert's words", "Apprentice summary", reasoning, guardrails, revoked/missing/unresolved notices, missing evidence/words)
- [X] T010 [US1] `components/workmap/WorkMapDetail.test.tsx`: every item × every evidence → correct `img` src and outline position; quotes; distinct labelled containers; no Confirmed badge for non-confirmed statuses across all fixture revisions

## Phase 4: US2 — Keyboard navigation and deep link (P1)
**Independent test**: keyboard-only traversal; deep link in a fresh tab.
- [X] T011 [P] [US2] Test-first `lib/workmap/listNav.test.ts` → `lib/workmap/listNav.ts`
- [X] T012 [P] [US2] Test-first `lib/workmap/deepLink.test.ts` → `lib/workmap/deepLink.ts`
- [X] T013 [US2] `components/workmap/WorkMapList.tsx` (roving tabindex, kind labels, markers) + `WorkMapList.test.tsx`
- [X] T014 [US2] `components/workmap/WorkMapScreen.tsx` (load, subscribe, deep-link notices) + test
- [X] T015 [US2] `app/map/page.tsx` binding `?entry&rev` with `router.replace`, inside `<Suspense>`

## Phase 5: US3 — Review view and revision updates (P1)
**Independent test**: scripted sequence updates label, markers and confirmation.
- [X] T016 [P] [US3] Test-first `lib/review/revisionDiff.test.ts` → `lib/review/revisionDiff.ts`
- [X] T017 [P] [US3] Test-first `lib/review/ws3Mappers.test.ts` → `lib/review/ws3Mappers.ts` (answered, confirmation for exact revision, previous-revision history)
- [X] T018 [P] [US3] Test-first `lib/review/reviewState.test.ts` → `lib/review/reviewState.ts`
- [X] T019 [US3] `components/review/{RevisionHeader,OpenQuestions,ChangeList,FixturePlayback,ReviewScreen}.tsx` + `review.module.css`
- [X] T020 [US3] `components/review/ReviewScreen.test.tsx`: subscribe delivers rev-2 → label + change marker + old → new; confirmation only for exact revision; no approve control
- [X] T021 [US3] `app/review/page.tsx`

## Phase 6: US4 — Supplementary marks (P2)
- [X] T022 [P] [US4] Test-first `lib/review/markState.test.ts` → `lib/review/markState.ts`
- [X] T023 [US4] `components/review/ReviewMarks.tsx` + `ReviewMarks.test.tsx` (pending until ack, failure shown, no double submit)

## Phase 7: Polish
- [X] T024 `e2e/workmap-review.spec.ts`: keyboard-only map navigation, deep link, review sequence; screenshots map/detail/review
- [X] T025 Run typecheck, vitest, playwright, build; fix findings
- [X] T026 Update `notes/ws7-ui-contracts-v0.md` (contract additions) and write `notes/ws7-sprints/handoff-sprint-1.md`

## Dependencies
Setup → Foundational → US1 → US2 (list/screen reuse detail) → US3 (reuses list/detail) → US4 (inside review) → Polish. T005, T011, T012, T016–T018, T022 are pure modules and can run in parallel.

## Implementation strategy
MVP = US1 + US2 (Work Map). Then US3/US4 (review). Commit after each phase.
