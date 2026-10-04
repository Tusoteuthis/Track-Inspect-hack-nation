# Tasks: WS7 Sprint 3 — Session setup and expert companion

**Input**: `specs/004-ws7-expert-companion/` (plan, spec, research, data-model, contracts)
**Tests**: required by the sprint prompt (TDD for reducer, mapper, shortcuts, fixture script).

## Phase 1: Setup
- [x] T001 Move `agentState()` + `AgentState` from `web/components/practice/TutorPanel.tsx` to `web/lib/ui/agentState.ts`; move its test to `web/lib/ui/agentState.test.ts`; TutorPanel re-imports it

## Phase 2: Foundational (contracts + fixture source)
- [x] T002 Add `CaseSummary`, `CompanionEvent`, `SessionView.rev?` to `web/lib/ui/contracts.ts`
- [x] T003 Extend `SourceUpdate` (`pointing_event`, `connection`) and `DataSource` (`listCases`, `startSession`, `requestPause`, `requestStop`, `getRecentEvents`) in `web/lib/data/source.ts`
- [x] T004 [P] Add `web/fixtures/ui/cases.json` (source: fixture, two cases, no answers)
- [x] T005 Write failing tests then implement `web/lib/data/fixtureExpertScript.ts` (+ `.test.ts`, fake timers): replay order, ack emits session push with rev+1 before resolving, fail options, drop/restore queues events, resync via getRecentEvents, per-instance state, unsubscribe stops timers
- [x] T006 Wire the script into `createFixtureSource` (`replayMs`, `failOffRecord`, `failPause`, `failStop` options) in `web/lib/data/fixtureSource.ts`; update `fixtureSource.test.ts`; expose controls via returned source helper
- [x] T007 [P] Extend `web/lib/data/stubSource.ts` with `session`, deferred `requestOffRecord/requestPause/requestStop/startSession`, `getRecentEvents`, `listCases`
- [x] T008 [P] Extend `web/lib/practice/fixtureSettings.ts` (+test) with `fixture_replay_ms` and `fixture_fail=offrecord|pause|stop`

## Phase 3: US1 — Honest evidence of pointing (P1)
- [x] T009 [P] [US1] TDD `web/lib/companion/eventToEvidence.ts` (+test): own-frame asset, region carries frame_id + mapping_status, unknown channel → null; mismatch case → `frame_mismatch`
- [x] T010 [US1] Add optional `notice` override prop to `web/components/evidence/EvidenceViewer.tsx` (default unchanged; existing tests pass)
- [x] T011 [US1] `web/components/companion/RecentEvents.tsx`: strip of ≤6 events, session time label, status text + icon, off-record tag, unknown channel
- [x] T012 [US1] Component tests `web/components/companion/ExpertCompanion.test.tsx`: ambiguous dashed + clarify text; unresolved no outline; frame mismatch refused; duplicate event shown once

## Phase 4: US2 — Acknowledged-only controls (P1)
- [x] T013 [US2] TDD `web/lib/companion/companionMachine.ts` (+ transition-table test) per data-model.md
- [x] T014 [US2] `web/components/companion/useCompanion.ts`: loads session, subscribes, applies via ref, request functions call DataSource then dispatch ACKED/ACK_FAILED; resync on reconnect
- [x] T015 [US2] `web/components/companion/ControlRail.tsx` + `web/lib/companion/copy.ts`: pause/resume, off/on record, stop (arm → confirm), pending text, `role=alert` errors, kbd hints
- [x] T016 [US2] `web/components/companion/ExpertCompanion.tsx` composing trace column (EvidenceViewer of latest event or "No pointing yet"), status block (agent, recording, OFF RECORD indicator), rail, ended state with `/review` link
- [x] T017 [US2] Component tests: off-record pending → indicator only after ack; failed ack alert keeps On record; pause/stop pending; stop ended links to /review

## Phase 5: US3 — Rail never covers trace + shortcuts (P2)
- [x] T018 [P] [US3] TDD `web/lib/companion/shortcuts.ts` (+test): P/O/S/[ mapping, ignore in inputs/modifiers
- [x] T019 [US3] Grid layout + collapse in `web/components/companion/companion.module.css`; keydown listener in ExpertCompanion

## Phase 6: US4 — Reconnecting + resync (P2)
- [x] T020 [US4] Reconnecting banner + `CompanionFixtureControls.tsx` (drop/restore, labelled Fixture behaviour); component test: reconnecting shown, restore resyncs latest session + events

## Phase 7: US5 — Setup, display, entry (P2)
- [x] T021 [P] [US5] `web/components/companion/ConnectionPanel.tsx` + `CompanionAgentStatus.tsx` (inside VoiceSession); unknown → "Unknown", fixture backend → "No backend: fixture data"
- [x] T022 [US5] `web/components/companion/ExpertSetup.tsx`: case picker, connection panel, open display link, optional labelled screen share (ScreenSharePanel copy props), Start (pending until ack)
- [x] T023 [US5] `web/app/expert/page.tsx`: fixture source from URL, VoiceSession(expert)+useExpertSession hosting setup → companion → ended; FIXTURE banner; h1 "Expert session"
- [x] T024 [P] [US5] `web/app/expert/display/page.tsx` + css: full-bleed trace, badge, Esc exits
- [x] T025 [US5] Setup component test: unknown statuses never "Connected"; start pending until ack

## Phase 8: Polish
- [x] T026 No-speech guard test `web/lib/companion/noSpeech.test.ts` (grep companion dirs for sendContextualUpdate/sendUserMessage/deliverFixture/sendMultimodalMessage)
- [x] T027 Playwright `web/e2e/expert.spec.ts`: full flow with screenshots to `test-results/expert/`, overlap test at 1280×800 and 390×844 (expanded + collapsed), reconnect, display page, entry page offers Expert session + Newcomer practice (FR-001)
- [x] T028 Run typecheck, vitest, Playwright, build; write `notes/ws7-sprints/handoff-sprint-3.md`; mark tasks done

## Dependencies
Phase 1 → 2 → (US1, US2 can start in parallel after T003) → US3/US4 (need T016) → US5 (needs T016 for start) → Polish.

## Parallel examples
- T004, T007, T008 alongside T005.
- T009 and T013 and T018 (pure modules) in parallel.

## Strategy
MVP = US1 + US2 (companion with honest evidence and acked controls); then rail/shortcuts, reconnect, setup/display.
