# Tasks: WS3 Sprint 4 — trust & completion

TDD: each logic task writes its failing test first (same task), then the code. Paths relative to `web/` unless stated.

## Phase 1: Setup
- [ ] T001 Read handoffs 0–3, capabilities Q6/Q7/(f) and current `lib/expert/*` (done during specify)

## Phase 2: Foundational (contracts)
- [ ] T002 Bump session `SCHEMA_VERSION` to `ws3.v1`, keep `EVENT_SCHEMA_VERSION = "ws3.v0"`; add `RecordingSegment.trigger`, `Strike`, `SessionCompletion` (final), `ElevenLabsDeletionReport`, snapshot fields `conversation_ids`, `recording_segments`, `off_record_excluded`, `strikes`, `end_cause`, `elevenlabs_deletions`; `PhaseTrigger` + `strike`, `resume`; validators incl. off-record leak check in `lib/expert/contracts.ts` (+ `contracts.snapshot.test.ts`)
- [ ] T003 Update `initialSession`, test fixtures/driver and existing tests for the new fields in `lib/expert/session.ts`, `lib/expert/test-driver.ts`

## Phase 3: US1 off-record (P1)
- [ ] T004 [US1] `lib/expert/record-state.ts` + `record-state.test.ts`: phrase detection, `setRecordState` (segments, retroactive trigger-utterance exclusion), `inOffRecord`, `offRecordLeaks`
- [ ] T005 [US1] Reducer: `record_state_changed` action, drop lines/marks/events/questions while off record or inside closed segments, refuse tools, capture-event trigger, close segment at session end in `lib/expert/session.ts`, `lib/expert/debrief.ts` (+ `off-record.test.ts`: events never released, off-record answer leaves gap open)
- [ ] T006 [US1] Sentinel test over every file the store writes: `lib/expert/trust-run.test.ts`
- [ ] T007 [US1] Renders: neutral off-record markers in `render.ts` (transcript.md, exchanges.md) and `knowledge-draft.md`

## Phase 4: US2 strike (P1)
- [ ] T008 [US2] `lib/expert/strike.ts` + `strike.test.ts`: remove words, redact derived text, supersede revisions, invalidate confirmations, phase back to teach-back, reopen teach-back exchange
- [ ] T009 [US2] Honour invalidated confirmations in `draft.ts` (`stepVerification`), `debrief.ts` (`proposeDraft` after strike), store immutability exception for superseded revisions in `store.ts`

## Phase 5: US3 completion & resume (P1)
- [ ] T010 [US3] `lib/expert/completion.ts` + test: derived completion, unfinished statements, counts from records, incomplete never confirmed
- [ ] T011 [US3] `session_ended` cause, `resumed` action, `lib/expert/resume.ts` summary + tests
- [ ] T012 [US3] Store writes `completion.json|md` when ended (removes them when reopened) and `loadSnapshot` in `store.ts`

## Phase 6: US4 demo evidence (P2)
- [ ] T013 [US4] `lib/expert/demo-evidence.ts` + test: checklist logic, annotated transcript, timing table, live vs fixture
- [ ] T014 [US4] Store writes `demo-evidence.md` at end; route `app/api/expert-sessions/[sessionId]/demo-evidence/route.ts`

## Phase 7: US5 ElevenLabs side (P2)
- [ ] T015 [US5] `lib/expert/elevenlabs-deletion.ts` + test with fake client; route `app/api/expert-sessions/[sessionId]/elevenlabs-deletion/route.ts` + route test with mocked SDK
- [ ] T016 [US5] Hook + console: record-state bar/toggle, mute option, sendUserActivity, strike button, completion panel, export button, deletion button/auto, resume in `components/expert/*`, `components/voice/VoiceSession.tsx`
- [ ] T017 [US5] Agent: `set_record_state`, `strike_last_answer` in `agents/expert/tools.json`, prompt section, 3 probes + case-level toolMocks in `scripts/probe-agents.mts`, `probe-lines.ts`, `probes.test.ts`; sync + probe 5×

## Phase 8: US6 docs (P2)
- [ ] T018 [US6] `notes/ws3-sprints/docs/voice-interface.md`, `trust.md`, contracts doc → ws3.v1

## Phase 9: Polish
- [ ] T019 typecheck, vitest, dev smoke on 3104, handoff `notes/ws3-sprints/handoff-sprint-4.md`

## Dependencies
T002–T003 → all. US1 → US2 (strike shares exclusion helpers) → US3 → US4. T015 independent after T012. T016 after T005–T015. T017 after T005/T008.
