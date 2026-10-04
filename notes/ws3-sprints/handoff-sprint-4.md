# WS3 Sprint 4 handoff — Off-record, session completion, demo evidence & WS5 handoff

Branch: worktree-ws03-sprint-4   Worktree: .claude/worktrees/ws03-sprint-4   Dev port: 3104 (taken by another agent during this sprint, see Decisions; smoke ran on 3114)   Spec: specs/20261004-081433-ws3-sprint-4-trust-completion/   Date: 2026-10-04   **Status: ✅ agent work done; awaiting human gate and merge**

> **Merge note:** Sprints 2 and 3 are not merged into `voice` yet (their human gates are pending). This branch is based on `worktree-ws03-sprint-3`, which contains Sprints 0–3 and `voice`. Merging only `worktree-ws03-sprint-4` brings in all of WS3. The dev console is at **`/dev`**.

## Delivered (files + one line each)

**Pure logic (test-first, vitest)**

| File | What it is |
|---|---|
| `web/lib/expert/record-state.ts` | Recording segments; phrase detection ("off the record", "stop recording" / "back on the record", "resume recording"); `switchRecordState` (retroactively excludes the utterance that asked to go off record, ≤ 30 s back); `excludedAt`; `OFF_RECORD_REFUSAL`; tool results |
| `web/lib/expert/strike.ts` | `strikeLastAnswer`: removes the expert's last answer (+ strike-request lines), redacts derived AI text, reopens coverage/gaps/open questions, supersedes citing revisions, invalidates confirmations, `confirmed` → `teach_back`, reopens a teach-back exchange |
| `web/lib/expert/completion.ts` | `deriveCompletion` (from stored records only; `completed` only with a valid confirmation of the latest revision), `renderCompletionMd` |
| `web/lib/expert/demo-evidence.ts` | `demoChecklist` (6 rows with links), `renderDemoEvidenceMd` (checklist, annotated transcript, timing table, live vs fixture) |
| `web/lib/expert/resume.ts` | `resumeSession` (same id, previous phase, trigger `resume`), `resumeSummary` (`[RESUME]`, no expert words) |
| `web/lib/expert/elevenlabs-deletion.ts` | `deletionRefusal`, `deleteSessionConversations` (session-scoped, SDK call injected) |
| `web/lib/expert/session.ts` | Actions `record_state_tool`, `record_state_changed`, `strike_requested`, `resumed`, `deletion_recorded`, `session_ended.cause`; off-record exclusion for lines, marks, events and all recording tools; `conversation_ids` |
| `web/lib/expert/debrief.ts`, `draft.ts`, `context-update.ts` | `activeConfirmations`, `isSuperseded`, `teachParentOf` (full re-teach after a strike), `openTeachBackExchange`; confirm refuses superseded revisions; `propose_draft` allowed after a strike; `[TEACH_BACK rev-n superseded]`, `[RECORD_STATE]`, `[CONTROL]` record/strike lines |
| `web/lib/expert/contracts.ts` | ws3.v1 (see Contract changes); server-side off-record leak guard in `validateSessionSnapshot`; `validateSessionCompletion` |
| `web/lib/expert/store.ts`, `render.ts`, `knowledge-render.ts`, `timing.ts` | `completion.json|md` + `demo-evidence.md` at session end (removed on resume); `loadSnapshot`, `exportDemoEvidence`, `saveDeletionReport`; redaction rewrite allowed only for superseded revisions; neutral off-record markers + strikes in `transcript.md`, `exchanges.md`, `knowledge-draft.md`; shared `renderTimingTable` |
| Tests | `off-record` (12), `strike` (5), `completion` (10, incl. resume), `demo-evidence` (5), `trust-run` (5, sentinel scan of every written file), `elevenlabs-deletion` (3), deletion route (3, SDK mocked), `contracts.snapshot` (+6), `probes` (+4); `test-driver.ts` gains `confirmedSession` and `fullSession` |

**Routes / UI**

| File | What it is |
|---|---|
| `web/app/api/expert-sessions/[sessionId]/elevenlabs-deletion/route.ts` | POST: deletes the conversations stored in that ended session's `session.json`, only if it had an off-record segment; 400/404/409 otherwise; writes `elevenlabs-deletion.json` |
| `web/app/api/expert-sessions/[sessionId]/demo-evidence/route.ts` | POST: re-derives `demo-evidence.md` from the saved files |
| `web/components/expert/useExpertSession.ts` | Client tools `set_record_state`, `strike_last_answer`; `ws3-record` sync; `sendUserActivity` every 4 s off record; release gate stops off record; end cause; auto-delete after the final save; export; resume |
| `web/components/expert/ExpertConsole.tsx` | Record-state bar (acknowledged state), "Go off / Back on the record", "mute mic while off the record", "Strike last answer", excluded counts and segments, ElevenLabs retention text + deletion button/auto option + per-conversation result, completion panel (unfinished list), "Export demo evidence" (checklist + Markdown), "Resume this session" |
| `web/components/voice/VoiceSession.tsx` | Optional `onStop`, `onSessionError` (tutor flow unchanged) |

**Agent:** `agents/expert/tools.json` (+ `set_record_state`, `strike_last_answer`), `agents/expert/system-prompt.md` ("Off the record and striking"), `agents/probes(.example).json` (+ `off-record`, `back-on-record`, `strike-last`, with case-level `toolMocks`), `web/scripts/probe-agents.mts` (+ case `toolMocks`, `requireReply`, `maxWords`), `web/lib/expert/probe-lines.ts` (app-generated results for the new cases).

**Docs:** `notes/ws3-sprints/docs/trust.md`, `notes/ws3-sprints/docs/voice-interface.md`, `notes/ws3-sprints/docs/contracts-v0.md` (→ ws3.v1, change table), spec-kit artifacts.

## Verification evidence

```
$ npm run typecheck
> tsc --noEmit                                   (exit 0, no errors)

$ npx vitest run
 Test Files  61 passed (61)
      Tests  931 passed (931)

$ npm run sync-agents -- --agent expert
      tool_6201m431032ce0fre0vtjwf0rt9w  set_record_state  [client]
      tool_0401m431037xfaaaaztshe6yvc6s  strike_last_answer  [client]
    builtInTools: skipTurn · turnEagerness: patient · turnTimeout: 15 · maxDurationSeconds: 1800
Done.

$ npm run probe -- expert --runs 5               (prompt at commit d424fb8)
═══ summary ═══
  expert/event-silent                5/5
  expert/already-described           5/5
  expert/leading-trap                5/5
  expert/two-events                  5/5
  expert/ambiguous                   5/5
  expert/duplicate-repeat            5/5
  expert/ambiguous-while-explaining  5/5
  expert/after-interpretation        5/5
  expert/usually-exception           5/5
  expert/stale-release               5/5
  expert/debrief-agenda-only         5/5
  expert/debrief-unknown-escalate    5/5
  expert/teach-back-shape            5/5
  expert/teach-back-correction       5/5
  expert/teach-back-silence          5/5
  expert/teach-back-subject-change   5/5
  expert/off-record                  5/5
  expert/back-on-record              5/5
  expert/strike-last                 5/5
```

One full run of 5, first attempt, no prompt iteration needed. Replies: `off-record` → `set_record_state {"state":"off_record"}` + "Okay, off the record." (5/5 identical); `back-on-record` → `set_record_state {"state":"on_record"}` + "Okay, back on the record." (no mention of the sentinel); `strike-last` → `strike_last_answer {...}` + "Okay, I've dropped that." Observation: the agent paraphrases the struck words into `strike_last_answer.reason` — the app ignores and never stores that param.

**Sentinel test** (`trust-run.test.ts`): full fixture session with "pineapple calibration" inside the off-record request and while off record, an off-record capture event (evt-005), a refused question about it, a struck answer ("kumquat"), confirmation, end; saved through the file store + demo-evidence export + deletion report. Every file in the folder (15, incl. `revisions/` and `elevenlabs-deletion.json`) is free of the sentinel, the struck word, `evt-005` and its image name. Mutation check: disabling the user-line exclusion makes 3 of its 5 tests fail.

**Dev-server smoke** (port 3114, curl; 3104 was in use by the ws7-sprint-3 worktree's server):
- `GET /dev` 200; `GET /api/conversation-token?flow=expert` → token.
- `PUT` of the scripted full session (off record + strike, ended) → 200, wrote 12 files + `revisions/`, incl. `completion.json|md`, `demo-evidence.md`; `grep -ril "pineapple|kumquat"` → nothing.
- `POST …/demo-evidence` → all 6 checklist rows ✓.
- `POST …/elevenlabs-deletion` on a session without off-record segment → 409 "has no off-record segment, so its conversation is kept"; unknown session → 404. (No live deletion call was made.)
- `PUT` with an injected transcript line inside the off-record segment → **400** "transcript[17] lies inside an off-record segment and must not be stored".
- Server stopped, both test session folders deleted. Before I noticed the port clash, my first PUTs went to the other agent's server on 3104 and were rejected there with 400 (nothing written; checked its `knowledge/sessions`).

## Decisions made (and why)

1. **Prerequisite deviation (orchestrator):** based on `worktree-ws03-sprint-3`, because Sprints 2/3 are not merged. A6 location check skipped (worktree verified by the orchestrator).
2. **Spec-kit:** specify → plan → tasks → analyze (no CRITICAL/HIGH findings) → implement, with defaults chosen without questions (recorded in `research.md`).
3. **Exclusion point:** content is dropped in the reducer at ingestion (state- and time-based), so the gap selector, the draft builder and every renderer never see it; the snapshot validator refuses leaks on the server as a second guard.
4. **Trigger utterance excluded retroactively** (the "off the record, X" line arrives before the tool call). The segment starts at that line; the "back on the record" line is dropped too.
5. **Four triggers, one mechanism:** agent tool (idempotent), console, client-side phrase detection, capture events (`record_state: off_record` switches off; only a capture event may end a capture-started segment; otherwise only the expert).
6. **Off-record events are no longer stored at all** (Sprint 2 kept them as `dropped_off_record` topics): "never written" is simpler and safer than "flagged".
7. **Strike** keeps the exchange id (empty answer lines) so links validate; redacts derived AI text in place; superseded revisions are rewritten (the only exception to revision immutability) and need a new revision + full re-teach; any confirmation that relied on the struck words is invalidated (simplest correct behaviour per the prompt) and the agent/console say so.
8. **ElevenLabs retention (orchestrator override):** zero-retention / `record_voice` / `retention_days` are **not** changed on the shared expert agent; documented in `trust.md` as available-but-not-applied (shared agent; ZRM disables `conversations.get` and restricts LLMs). **Implemented instead:** the session-scoped deletion route (console button + "delete when it ends" option, default on, only with off-record segments; ids only from that session's saved file). Mic mute while off record is a console option, **default off**, because a muted expert cannot say "back on the record"; honest status: unverified in voice.
9. **Schema version:** session records bumped to `ws3.v1`; `PointingEvent` stays `ws3.v0` (WS2's contract did not change, and fixtures stay valid).
10. **Completion** derived purely from the snapshot; written only for ended sessions; removed on resume. `end_reason`: `completed` ⇔ valid confirmation of the latest revision in phase `confirmed`; `aborted` on error; otherwise `incomplete`.
11. **Demo evidence** "at a pause" = the question's `agent_speech_started` was not inside an expert speech interval. The off-record row is ✗ "not exercised" when a session has no off-record segment (honest, not padded).
12. **Resume** is a console action ("Resume this session", then Start), not automatic: a deliberate Stop and a drop look similar to the SDK.
13. **Dev port:** 3104 was occupied by another agent's server (ws7-sprint-3); I did not touch it and ran the smoke on 3114.

## Contract changes (`web/lib/expert/contracts.ts`) — bumped to `ws3.v1`

- `SCHEMA_VERSION = "ws3.v1"`; new `EVENT_SCHEMA_VERSION = "ws3.v0"` for `PointingEvent`.
- `SessionSnapshot` + `conversation_ids[]`, `end_cause`, `recording_segments[]`, `off_record_excluded`, `strikes[]`, `elevenlabs_deletions[]`.
- `RecordingSegment` + `trigger`; new `RecordStateTrigger`, `EndCause`, `OffRecordExcluded`, `Strike`, `ElevenLabsDeletionReport`, `ElevenLabsDeletionStatus`, `SetRecordStateParams`.
- `SessionCompletion` final shape (+ `schema_version`, `conversation_ids`, `started_at_utc`, `end_cause`, `final_phase`, `latest_revision_id`, `open_gap_ids`, `unfinished`, richer `excluded`, `counts` + `teach_backs`, `confirmations`, `strikes`).
- `PhaseTrigger` + `strike`, `resume`.
- Validators: off-record leak guard + segment/strike/deletion checks in `validateSessionSnapshot`; new `validateSessionCompletion`, `validateSetRecordStateParams`, `validateDeletionReport`; helpers `offRecordIntervals`, `isInsideOffRecord`.
- Documented with a change table in `notes/ws3-sprints/docs/contracts-v0.md`.

## Known limitations / open issues

- **Voice is unverified** for everything new: phrase detection on real transcripts, the agent's spoken acknowledgements, `sendUserActivity` vs the 15 s turn timeout while off record, mic mute (LiveKit `track.mute()`), resume in a new conversation. Probes are text simulations.
- **Off-record words reach ElevenLabs** unless the mic is muted: STT + the LLM context of that conversation, stored under the account's default retention until the conversation is deleted. The agent is told never to use them (probe 5/5), which is model behaviour, not a guarantee.
- **Live deletion not exercised this sprint** (route verified with the SDK mocked; `conversations.delete` itself was VERIFIED LIVE in Sprint 0). Deleting right after the end may fail while ElevenLabs is still processing; the console shows the error and the button retries.
- Retroactive exclusion relies on the phrase regex or on the agent calling the tool quickly; a request in unusual words that the agent recognises late may leave the previous expert line on record if the agent spoke in between.
- Strike: agent utterances that paraphrased the struck answer (e.g. a later follow-up question), other than teach-backs of superseded revisions, are not rewritten. A second "forget that" strikes the next older answer.
- Resume: the agent greets again (first message cannot be overridden on this agent) and knows only the `[RESUME]` summary.
- Inherited: reload the page between sessions; `audio_offset_secs` stays null; Sprint 1–3 worktrees share the expert agent, which now has the two new tools (their apps answer "unknown client tool" if the agent calls them).

## Human gate checklist

Prerequisites: none (`web/.env` has the key and agent id; the agent is synced).

1. `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-4/web && npm run dev -- -p 3104` (if 3104 is still taken by the ws7-sprint-3 server, use `-p 3114`). Open http://localhost:3104/dev, keep "Expert capture", Start, allow the mic.
2. Run the fixture scenario and a full session as in Sprint 3 (≥ 3 live questions incl. a guardrail).
3. Midway, after answering a question, say **"Off the record."** — check: the console's record bar turns **OFF THE RECORD (agent tool / expert phrase)** and the agent says only "Okay, off the record." Say a sentinel, e.g. **"pineapple calibration was never signed off."** Optionally press the evt-005 (OFF-RECORD) fixture. Wait ~20 s in silence: the agent should stay silent. Then say **"Back on the record."** — check: bar back to on the record, agent says "Okay, back on the record." and never mentions the sentinel later (debrief, teach-back).
4. Optional strike: answer a debrief question, then say **"Forget what I just said."** — check: the agent acknowledges ("I've dropped that"), the console shows 1 strike, the gap reopens.
5. Finish: "I'm done", debrief (≥ 3), teach-back, "Yes, that's right." Press Stop.
6. `grep -ri pineapple /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-4/knowledge/sessions/<id>/` must return nothing.
7. Console: the ElevenLabs line shows the deletion result per conversation (`deleted`), or an error you can retry with "Delete ElevenLabs conversation(s) now". Read `notes/ws3-sprints/docs/trust.md` §3 for what is and isn't claimed.
8. Open `knowledge/sessions/<id>/demo-evidence.md` (or press **Export demo evidence**): all 6 rows ✓; `completion.md` says COMPLETED for `rev-N`.
9. Reload, start a second session, stop it before the teach-back. Check `completion.md` says **INCOMPLETE** and lists what was not finished. Optionally press **Resume this session**, Start, and check the phase continues (best effort).
10. If satisfied, merge from the main checkout once it's clean and no other agent is mid-commit: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-4` (contains Sprints 0–3), then `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-4` (and the Sprint 0–3 worktrees). Hand `notes/ws3-sprints/docs/voice-interface.md` to WS5. The main checkout's `web/.env` needs `ELEVENLABS_AGENT_ID_EXPERT=agent_3701m420qeqff2ysp5xh34vfkt5a` and the working key.

## WS3 status vs §11 acceptance criteria (`notes/03-elevenlabs-expert-interaction.md`)

| §11 criterion | Status | Evidence | Still needs |
|---|---|---|---|
| Three relevant live questions, incl. a guardrail, supported by identifiable visual events | ✅ in code/probes; ⏳ live | Event-linked `begin_question` (S1), release at pauses + guardrail follow-up (S2, probes 5/5), demo-evidence rows 1–2 | Human gates S1–S4 |
| Three distinct debrief questions on genuinely unanswered matters | ✅ code/probes; ⏳ live | Frozen agenda of uncovered gaps, gap-gated `begin_question` (S3, probes 5/5), demo-evidence row 3 | Human gate |
| Timing shows the agent waits and doesn't interrupt or repeat | ✅ measured; ⏳ live | Speech detector, release gate, interruption/duplicate counters, `timing-report.md`, timing table in demo evidence (S2) | Live tuning of `pause_ms` / `mic_threshold` |
| Questions, answers and map entries refer to the correct event even if the expert moves on | ✅ | `event_id` fixed at `begin_question`, stale releases, alias merge (S1–S2 tests); steps cite event + exchange (S3) | — |
| Expert can correct; the confirmed revision reflects it | ✅ code/probes | Immutable revisions, `corrected` → rev-n+1 with change exchange (S3, probe 5/5) | Human gate |
| Confirmation explicit and auditable | ✅ | `confirm_revision` needs an explicit expert response on the exact latest revision; silence/subject change never confirm (probes 5/5); `confirmations.json`; strikes invalidate (S4) | — |
| Off-record content excluded or removed consistently from recording and knowledge paths | ✅ local; ⚠️ ElevenLabs side partial | In-memory exclusion + server leak guard + sentinel scan of every file (S4); session-scoped conversation deletion; retention limits documented in `trust.md` | Live gate; live deletion run; team decision on agent retention settings |
| Captured output sufficient for WS5 to teach a new case without an unrelated answer script | ✅ interface; ⏳ WS5 | `knowledge-draft.md`, revisions, confirmations, exchanges with verbatim words + images; eligibility rule and `synthesis.ts` documented in `voice-interface.md`; no answer key loaded anywhere | WS5 tutor consuming it |

## Notes for the next owner (WS3 is done)

- WS5: start from `voice-interface.md` §2 (eligibility = `completion.json.confirmed_revision_id` + `stepVerification(revisions, activeConfirmations(snapshot))`). Your `eligibility.ts` already guards `off_record_evidence` and `superseded`.
- WS6: keep `validateSessionSnapshot` on your write path (it is the off-record leak guard) and the revision-immutability rule with its strike exception.
- WS7: show the record state from `recording_segments.at(-1)` and the deletion result from `elevenlabs_deletions`; reuse the console's routes rather than local toggles.
- If the team wants stronger ElevenLabs-side privacy, a dedicated expert agent with `record_voice: false` and a short `retention_days` via `sync-agents` settings is the low-risk next step; ZRM needs an LLM check and loses `conversations.get`.
