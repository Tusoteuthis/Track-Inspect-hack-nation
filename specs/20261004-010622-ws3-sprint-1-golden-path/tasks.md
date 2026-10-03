# Tasks: WS3 Sprint 1 — Golden path

`[P]` = can run in parallel with other tasks. Lane A and Lane B touch disjoint files; Lane C depends on Lane A.

## Phase 1: Setup
- [x] T001 Create worktree `ws03-sprint-1` from `worktree-ws03-sprint-0`; copy `web/.env`; create `agents/manifest.json` and `agents/probes.json` from the examples; run `npm ci`; get a green baseline (typecheck, 19 tests)
- [ ] T002 Add `knowledge/sessions/` to root `.gitignore`

## Phase 2: Foundational (Lane A, contracts) — blocks US1–US3
- [ ] T003 Tests first: validators for `begin_question` params, ExpertExchange, TimingMark and SessionSnapshot in `web/lib/expert/contracts.test.ts`
- [ ] T004 Add `question_planned`, `SessionSnapshot`, `TranscriptEntry`, `UnlinkedQuestion` and the validators to `web/lib/expert/contracts.ts`; update `notes/ws3-sprints/docs/contracts-v0.md`
- [ ] T005 [P] Test and fix `tentativeTextFrom` for `tentative_agent_response` in `web/lib/voice/transcript.ts`

## Phase 3: US1 + US2 — linkage (Lane A, P1)
- [ ] T006 Tests first, `web/lib/expert/context-update.test.ts`: format, no fixture label in output for all 5 fixtures, null → unknown, off-record and ambiguous tails
- [ ] T007 Implement `web/lib/expert/context-update.ts`
- [ ] T008 Tests first, `web/lib/expert/session.test.ts`:
  - answers attach to the active exchange
  - a new event during an answer does not re-link it
  - an unknown event_id gives an error result and no exchange
  - unlinked agent question detection
  - preamble
  - the question comes from the next agent line
  - timing marks
  - duplicate events
  - "none" maps to null
  - session end
- [ ] T009 Implement the `web/lib/expert/session.ts` reducer, plus `newSessionId` and `injectFixture`
- [ ] T010 [P] Add `web/lib/expert/fixtures.ts`, a static list of the 5 fixtures

## Phase 4: US3 — persistence (Lane A, P1)
- [ ] T011 Tests first, `web/lib/expert/render.test.ts`: `transcript.md` and `exchanges.md` content
- [ ] T012 Implement `web/lib/expert/render.ts`
- [ ] T013 Tests first, `web/lib/expert/store.test.ts`: path sanitization, all 6 files written atomically, idempotent rewrite
- [ ] T014 Implement `web/lib/expert/store.ts`
- [ ] T015 Add the route `web/app/api/expert-sessions/[sessionId]/snapshot/route.ts`

## Phase 5: US4 — agent config (Lane B, P2) [P with Phases 2–4]
- [ ] T016 [P] Write `agents/expert/system-prompt.md`, `first-message.md` and `tools.json`
- [ ] T017 [P] Add expert `systemPrompt`, `firstMessage`, `tools` and `settings` to `agents/manifest.json` and `manifest.example.json`
- [ ] T018 Extend `web/scripts/sync-agents.mts`: create from scratch, upsert tools plus `toolIds`, apply settings, read back
- [ ] T019 Extend `web/scripts/probe-agents.mts`: `history` cases, `toolMockConfig`, assertions, `--runs N` pass counts
- [ ] T020 Write expert cases 1–5 in `agents/probes.json` and the example
- [ ] T021 Run sync (create the agent), then probes 5×; tune the prompt until each case passes ≥ 4/5; record the counts

## Phase 6: UI wiring (Lane C, after Lane A)
- [ ] T022 Add optional props `onAgentModeChange` and `onDisconnected` to `web/components/voice/VoiceSession.tsx`
- [ ] T023 Add the `web/components/expert/useExpertSession.ts` hook: reducer, ref-backed `clientTools`, `deliverEvent`, debounced save, save status
- [ ] T024 Add `web/components/expert/ExpertConsole.tsx` and its styles in `web/app/globals.css`
- [ ] T025 Wire the expert flow in `web/app/page.tsx`, with a "raw" toggle for ContextSender

## Phase 7: Polish and verification
- [ ] T026 Run typecheck and the full test suite; start the dev server on 3101; load the page; curl the snapshot route (good id and bad id); inspect the files
- [ ] T027 Write `notes/ws3-sprints/handoff-sprint-1.md` with pasted outputs, deviations and the human gate
