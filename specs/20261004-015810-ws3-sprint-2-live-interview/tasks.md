# Tasks: WS3 Sprint 2 — Live interview quality

**Input**: `specs/20261004-015810-ws3-sprint-2-live-interview/` (spec, plan, research, data-model, contracts)

**Tests**: required (sprint prompt + constitution VII: pure logic test-first with vitest). Within each story, test tasks come first and must fail before implementation.

Paths are relative to the worktree root; `web/` is the Next.js app.

## Phase 1: Setup

- [ ] T001 Verify worktree baseline: `cd web && npm run typecheck && npx vitest run` green on the merged base (record counts)

## Phase 2: Foundational (contracts + config)

- [ ] T002 Write failing tests for new contract types/validators (Topic, InterviewConfig, exchange `topic_id`/`related_event_ids`, new marks, snapshot cross-checks) in web/lib/expert/contracts.snapshot.test.ts
- [ ] T003 Add `TopicState`, `Topic`, `DeferredReason`, `InterviewConfig`, marks `user_speech_started|user_speech_ended|topic_nudged`, `ExpertExchange.topic_id`/`related_event_ids`, `SessionSnapshot.topics`/`interview_config` and validators in web/lib/expert/contracts.ts
- [ ] T004 Create defaults `DEFAULT_INTERVIEW_CONFIG` and `withConfig(partial)` in web/lib/expert/interview-config.ts (+ test web/lib/expert/interview-config.test.ts)
- [ ] T005 Update fixtures of existing tests (session/render/store/contracts tests) to the new snapshot shape so the suite is green again

## Phase 3: User Story 1 — never talk over the expert (P1)

**Goal**: topics are released only at a pause, one at a time. **Independent test**: planner + speech detector unit tests; live interruptions = 0.

- [ ] T006 [P] [US1] Failing tests for the speech detector (VAD/mic/tentative start speaking, final only refreshes activity, hold-based end stamped at last activity, mic ignored while agent speaks) in web/lib/expert/speech.test.ts
- [ ] T007 [P] [US1] Implement `initialSpeech`, `observeSpeech`, `settleSpeech` in web/lib/expert/speech.ts
- [ ] T008 [US1] Failing tests for `planRelease` gating: each of agent speaking / user speaking / quiet < pause_ms / open topic / nothing queued blocks; all clear → release oldest queued; released topic deferred on moved_on / release_timeout; nudge after `nudge_after_ms` only when gate still holds and agent has not acted; nudge disabled at 0; off-record never released — in web/lib/expert/topics.test.ts
- [ ] T009 [US1] Implement `openTopic`, `planRelease` (and `ReleaseDecision`) in web/lib/expert/topics.ts
- [ ] T010 [US1] Failing reducer tests: `topic_released`, `topics_deferred`, `topic_nudged`, `user_speech_changed` actions write state + marks; `event_received` creates a queued topic + `topic_queued` mark; first answer → topic answered — in web/lib/expert/session.test.ts
- [ ] T011 [US1] Implement those reducer actions in web/lib/expert/session.ts
- [ ] T012 [P] [US1] Add `tentativeUserTextFrom` (+ tests) in web/lib/voice/transcript.ts / transcript.test.ts
- [ ] T013 [US1] Add optional `onVadScore` and `onUserTentative` props in web/components/voice/VoiceSession.tsx (tutor flow unchanged)
- [ ] T014 [US1] Release controller in web/components/expert/useExpertSession.ts: events only queued on arrival; speech ref fed by VAD/tentative/final/mic; 200 ms `tick(controls)` runs `planRelease` and performs release (`sendContextualUpdate`, contextId = primary event), nudge (`sendUserMessage`), defer; drop `[CONTROL]` user lines from the record
- [ ] T015 [US1] Prompt: release semantics, skip_turn mid-explanation, `[CONTROL]`/`[STATE]` lines, in agents/expert/system-prompt.md
- [ ] T016 [US1] sync-agents: `turnTimeout` and `skipTurnDescription` settings in web/scripts/sync-agents.mts; set them in agents/manifest.json and agents/manifest.example.json

## Phase 4: User Story 2 — no repeats, honest ambiguity, stale references (P1)

**Goal**: dedup, clarify-first, stale wording. **Independent test**: unit tests + probes duplicate/ambiguous/stale.

- [ ] T017 [P] [US2] Failing tests: `regionIoU`; dedup edges (window 20 000 inclusive / 20 001 new; IoU 0.5 merge / 0.49 new; other channel; null=null; record_state differs; duplicate of answered topic) via `ingestEvent` in web/lib/expert/topics.test.ts
- [ ] T018 [US2] Implement `regionIoU`, `findDuplicateTopic`, `ingestEvent` in web/lib/expert/topics.ts
- [ ] T019 [US2] Failing tests: `isStale` (wait > 30 s; newer topic; not stale otherwise) and release text contains stale sentence with channel / "the trace" in web/lib/expert/topics.test.ts and web/lib/expert/context-update.test.ts
- [ ] T020 [US2] Implement `isStale` and `formatPointingEventUpdate(event, { stale, guardrailPending })` in web/lib/expert/topics.ts and web/lib/expert/context-update.ts
- [ ] T021 [US2] Failing reducer tests: alias event_received → alias + `topic_queued` mark, no new topic; `begin_question` on alias → exchange on primary with `related_event_ids`; ambiguous topic rejects non-clarify first question, accepts clarify, then accepts others — in web/lib/expert/session.test.ts
- [ ] T022 [US2] Implement alias attribution and clarify-first enforcement in web/lib/expert/session.ts
- [ ] T023 [US2] Prompt: stale wording, duplicates never re-asked, clarify-first, clarification answer is not an interpretation, in agents/expert/system-prompt.md

## Phase 5: User Story 3 — budget and deeper follow-ups (P2)

- [ ] T024 [US3] Failing tests: budget counts question marks in rolling window + open released topic; at limit `planRelease` defers the candidate with reason `budget`; frees up after window; `budgetState` in web/lib/expert/topics.test.ts
- [ ] T025 [US3] Implement budget in `planRelease` and `budgetState` in web/lib/expert/topics.ts; send `[STATE]` budget updates (contextId `ws3-state`) on change in web/components/expert/useExpertSession.ts
- [ ] T026 [US3] Prompt: deeper after interpretation, "usually" → exception, ≥ 1 guardrail, budget used-up → skip_turn, in agents/expert/system-prompt.md
- [ ] T027 [US3] Probe harness: `forbidKinds`, `requirePatterns`, `toolOptional` in web/scripts/probe-agents.mts
- [ ] T028 [US3] Add 5 probe cases (duplicate, ambiguous-detailed, after-interpretation, usually, stale) in agents/probes.json and agents/probes.example.json, plus a vitest check that probe event lines match `formatPointingEventUpdate` in web/lib/expert/probes.test.ts

## Phase 6: User Story 4 — timing evidence and fixture scenario (P2)

- [ ] T029 [P] [US4] Failing tests for `exchangeTimings`, `countInterruptions`, `liveCounters`, `renderTimingReportMd` in web/lib/expert/timing.test.ts
- [ ] T030 [P] [US4] Implement web/lib/expert/timing.ts
- [ ] T031 [P] [US4] Failing tests + implementation of `DEFAULT_SCENARIO`, `parseScenarioOffsets` in web/lib/expert/scenario.ts / scenario.test.ts
- [ ] T032 [US4] Store writes `timing-report.md` and counters in session.json (tests in web/lib/expert/store.test.ts) in web/lib/expert/store.ts; render topic/related events in web/lib/expert/render.ts
- [ ] T033 [US4] Console: counters, gate status, `pause_ms` input, topics list, compact timing table, "Run fixture scenario" with offsets + cancel, in web/components/expert/ExpertConsole.tsx (+ styles in web/app/globals.css)

## Phase 7: Polish

- [ ] T034 Run `npm run sync-agents -- --agent expert` and record the read-back
- [ ] T035 Run `npm run probe -- expert --runs 5`; iterate prompt until every case ≥ 4/5; record counts
- [ ] T036 Simulated scenario check: a vitest that drives the reducer + planner through the fixture scenario with scripted speech/agent behaviour and asserts the acceptance counts, in web/lib/expert/scenario-run.test.ts
- [ ] T037 Dev-server smoke on port 3102 (page loads, no console errors, `/api/conversation-token?flow=expert` ok)
- [ ] T038 Update notes/ws3-sprints/docs/contracts-v0.md (Topic, config, new fields/marks, timing-report.md)
- [ ] T039 Write notes/ws3-sprints/handoff-sprint-2.md (A8 template: pause_ms, turn settings, limitations, gate steps)

## Dependencies

- Phase 2 blocks all stories. US1 and US2 both touch topics.ts/session.ts → run sequentially (US1 → US2). US3 depends on planRelease (US1). US4 timing.ts/scenario.ts are independent of US2/US3 (parallel lane possible); console (T033) last.
- Polish after all stories.

## Parallel examples

- T006/T007 (speech.ts) ∥ T012 (transcript.ts) ∥ T029–T031 (timing.ts, scenario.ts): different files, no shared state.

## Implementation strategy

MVP = Phase 2 + US1 (pause-gated release). Then US2 (dedup/clarify/stale), US3 (budget + prompt + probes), US4 (timing report + console scenario). One commit per logical step.
