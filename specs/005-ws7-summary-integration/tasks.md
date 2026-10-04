# Tasks: WS7 Sprint 4 — Summary, trust controls, apiSource, demo

## Phase 1: Foundational contracts
- [ ] T001 Additive contract changes in `web/lib/ui/contracts.ts` and `web/lib/data/source.ts` (plan §Contracts); stub source gains `revokeEntry`/`deleteEvidence`/assessment/practice hooks
- [ ] T002 TDD `web/lib/data/fixtureKnowledge.ts` (shared revoke/delete store, cascade event → citing entries revoked, apply to Work Map/review views, listeners, reset)
- [ ] T003 Wire into `createFixtureSource`: `revokeEntry`, `deleteEvidence`, `failRevoke`/`failDelete`, views pass through the store; `fixture_fail=revoke|delete`

## Phase 2: US1 Learning summary (Lane A)
- [ ] T004 [P] TDD `web/lib/summary/assessmentMapper.ts` (WS5 decisions → AssessmentView) and `web/lib/summary/groups.ts` (display guard)
- [ ] T005 Populate `web/fixtures/ui/assessment.json` (labelled fixture, one assisted + one unresolved, citations to confirmed entries)
- [ ] T006 `web/components/summary/SummaryScreen.tsx` + `app/summary/page.tsx`; component test: assisted never under "done independently", deep links, no score, empty + error state

## Phase 3: US2/US3 Trust + states (Lane B)
- [ ] T007 TDD `web/lib/trust/trustState.ts` (pending until ack, double-submit guard, failure keeps state)
- [ ] T008 `web/components/trust/TrustControls.tsx` (request correction, remove from teaching with confirm press, delete evidence) on `/map` detail and `/review`; tests: deletion pending until acked, failure visible
- [ ] T009 Practice revocation: `KNOWLEDGE_REVOKED` in `reviewMachine` (+test), loop drops revoked citations; component test: revoked item disappears from `/practice` citations
- [ ] T010 `web/components/shell/ConnectionStatus.tsx` + `useConnectionState` (+test); use on all data screens, replace companion's own banner
- [ ] T011 Route error-state test: every screen renders `role=alert` when the source rejects; add missing empty/error states
- [ ] T012 Keyboard/focus + colour-only pass (summary, trust controls, status badges)

## Phase 4: US4 apiSource (Lane C)
- [ ] T013 [P] `web/lib/data/ws6Wire.ts` + TDD `web/lib/data/ws6Mappers.ts`
- [ ] T014 [P] TDD `web/lib/data/apiSource.ts` (mocked fetch, fake EventSource: BusEvent → re-fetch → SourceUpdate; connection states)
- [ ] T015 `web/lib/data/screenSources.ts` (+test) + `useScreenSource(screen)`; pages use it; `?session=` on review/map/summary

## Phase 5: US5 Demo (Lane D)
- [ ] T016 `web/e2e/journey.spec.ts` full journey at 1920×1080 with screenshots
- [ ] T017 `notes/ws7-demo-navigation.md`, `web/README.md` section
- [ ] T018 typecheck, vitest, Playwright, build + evaluator grep; `notes/ws7-sprints/handoff-sprint-4.md`
