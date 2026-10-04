# Tasks: WS7 Sprint 4 — Summary, trust controls, apiSource, demo

## Phase 1: Foundational contracts
- [x] T001 Additive contract changes in `web/lib/ui/contracts.ts` and `web/lib/data/source.ts` (plan §Contracts); stub source gains `revokeEntry`/`deleteEvidence`/assessment/practice hooks
- [x] T002 TDD `web/lib/data/fixtureKnowledge.ts` (shared revoke/delete store, cascade event → citing entries revoked, apply to Work Map/review views, listeners, reset)
- [x] T003 Wire into `createFixtureSource`: `revokeEntry`, `deleteEvidence`, `failRevoke`/`failDelete`, views pass through the store; `fixture_fail=revoke|delete`

## Phase 2: US1 Learning summary (Lane A)
- [x] T004 [P] WS5 decisions → AssessmentView mapping (done in `web/lib/data/ws6Mappers.ts`, Lane C) and TDD `web/lib/summary/groups.ts` (display guard)
- [x] T005 Populate `web/fixtures/ui/assessment.json` (labelled fixture, one assisted + one unresolved, citations to confirmed entries)
- [x] T006 `web/components/summary/SummaryScreen.tsx` + `app/summary/page.tsx`; component test: assisted never under "done independently", deep links, no score, empty + error state

## Phase 3: US2/US3 Trust + states (Lane B)
- [x] T007 TDD `web/lib/trust/trustState.ts` (pending until ack, double-submit guard, failure keeps state)
- [x] T008 `web/components/trust/TrustControls.tsx` (request correction, remove from teaching with confirm press, delete evidence) on `/map` detail and `/review`; tests: deletion pending until acked, failure visible
- [x] T009 Practice revocation: `KNOWLEDGE_REVOKED` in `reviewMachine` (+test), loop drops revoked citations; component test: revoked item disappears from `/practice` citations
- [x] T010 `web/components/shell/ConnectionStatus.tsx` + `useConnectionState` (covered by SummaryScreen + ExpertCompanion tests); use on all data screens, replace companion's own banner
- [x] T011 Route error-state test: every screen renders `role=alert` when the source rejects; add missing empty/error states
- [x] T012 Keyboard/focus + colour-only pass (summary, trust controls, status badges)

## Phase 4: US4 apiSource (Lane C)
- [x] T013 [P] `web/lib/data/ws6Wire.ts` + TDD `web/lib/data/ws6Mappers.ts`
- [x] T014 [P] TDD `web/lib/data/apiSource.ts` (mocked fetch, fake EventSource: BusEvent → re-fetch → SourceUpdate; connection states)
- [x] T015 `web/lib/data/screenSources.ts` (+test) + `useScreenSource(screen)`; pages use it; `?session=` on review/map/summary

## Phase 5: US5 Demo (Lane D)
- [x] T016 `web/e2e/journey.spec.ts` full journey at 1920×1080 with screenshots
- [x] T017 `notes/ws7-demo-navigation.md`, `web/README.md` section
- [x] T018 typecheck, vitest, Playwright, build + evaluator grep; `notes/ws7-sprints/handoff-sprint-4.md`
