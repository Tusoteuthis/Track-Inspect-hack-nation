# WS3 Sprint 2 handoff — Live interview quality: topic queue, dedup, ambiguity, pause-aware asking, timing

Branch: worktree-ws03-sprint-2   Worktree: .claude/worktrees/ws03-sprint-2   Dev port: 3102   Spec: specs/20261004-015810-ws3-sprint-2-live-interview/   Date: 2026-10-04   **Status: ✅ agent work done; awaiting human gate and merge**

> **Merge note:** Sprint 1 was not merged into `voice` when this sprint started (its live gate was still pending). So this branch is based on `worktree-ws03-sprint-1` (which contains Sprint 0), with the current `voice` merged in (commit `cf19b27`). Merge order: `worktree-ws03-sprint-1` first (or skip it — this branch contains it), then `worktree-ws03-sprint-2`.
>
> Merge conflicts resolved in `cf19b27`: WS7 had turned `/` into an entry page and moved the old voice home page unchanged to `/dev`. `/` keeps WS7's page; the WS3 expert dev console now lives at **`/dev`**. `.gitignore` = union of both sides.

## Delivered (files + one line each)

**Pure logic (test-first, vitest)**

| File | What it is |
|---|---|
| `web/lib/expert/topics.ts` | `regionIoU`, `findDuplicateTopic` / `ingestEvent` (channel + record_state + IoU ≥ 0.5 + ≤ 20 s from the topic's newest event), `isStale`, `releaseText`, `openTopic`, `budgetState`, `planRelease` → release / nudge / defer / wait (with block reasons) |
| `web/lib/expert/speech.ts` | Expert-speech detector: server VAD ≥ 0.5, tentative user transcript, local mic ≥ 0.04 (ignored while the agent talks); interval ends 400 ms after the last signal and is stamped at that last signal; final lines only refresh "last activity" |
| `web/lib/expert/timing.ts` | `exchangeTimings` (processing / intentional wait / release→tool / tool→speech / release→speech), `countInterruptions`, `liveCounters`, `renderTimingReportMd` |
| `web/lib/expert/interview-config.ts` | Defaults + `withConfig` for all tunables |
| `web/lib/expert/scenario.ts` | Default fixture scenario (evt-001 @0 s, evt-003 @8 s, evt-002 @70 s, evt-004 @140 s) + offset parsing |
| `web/lib/expert/context-update.ts` | Release wording: `stale=yes …"the region you pointed at a moment ago on SYS1"`, guardrail-pending reminder, `controlNudge`, `isControlText`, `budgetStateLine` |
| `web/lib/expert/session.ts` | Reducer: topics on `event_received` (+ `topic_queued`, also for aliases), `topic_released` / `topic_nudged` / `topics_deferred` / `user_speech_changed` / `config_changed`; alias questions attributed to the primary event with `related_event_ids`; **clarify-first enforced** (tool returns an error); topic asked → answered at the first answer line |
| `web/lib/expert/contracts.ts` | `Topic`, `TopicState`, `DeferredReason`, `InterviewConfig`, exchange `topic_id` / `related_event_ids`, marks `user_speech_started/ended`, `topic_nudged`, validators `validateTopic`, `validateInterviewConfig`, snapshot cross-checks |
| `web/lib/expert/store.ts`, `render.ts` | Writes `timing-report.md`; `session.json.counts` adds the derived counters; `exchanges.md` shows topic, merged duplicates and "clarification ≠ interpretation" |
| `web/lib/voice/transcript.ts` | `tentativeUserTextFrom` |
| Tests | `topics` (32), `speech` (8), `timing` (12), `scenario` (3), `scenario-run` (6, simulated fixture run), `probes` (30, probe wording = app wording), `interview-config` (2), plus new cases in `session`, `contracts.snapshot`, `context-update`, `store`, `render`, `transcript` |

**UI wiring**

| File | What it is |
|---|---|
| `web/components/voice/VoiceSession.tsx` | New optional props `onVadScore`, `onUserTentative` (tutor flow unchanged) |
| `web/components/expert/useExpertSession.ts` | Events are only **queued** on arrival. `tick(io)` every 200 ms: polls mic, settles speech, runs `planRelease`, then sends the release (`sendContextualUpdate`, `contextId = event_id`), one nudge (`sendUserMessage("[CONTROL] …")`) or defers; sends `[STATE] live_question_budget=…` (`contextId ws3-state`) on change; drops `[CONTROL]` lines from the expert record; scenario runner; `setConfig` |
| `web/components/expert/ExpertConsole.tsx` | Counters (derived via `liveCounters`), release-gate line (decision, reasons, quiet ms, budget), tunables `pause_ms` / `nudge_after_ms` / `mic_threshold`, **Run fixture scenario** (editable offsets, cancel), topics list, timing-per-question table, all marks behind `<details>` |
| `web/app/dev/page.tsx` | The Sprint 1 expert console page (moved here by the merge) |

**Agent config**

| File | What it is |
|---|---|
| `agents/expert/system-prompt.md` | Events arrive at pauses; `stale=yes` → name the earlier moment; `[CONTROL]` / `[STATE]` lines; `skip_turn` by default; never re-ask; clarify-first even mid-explanation (answer ≠ interpretation); follow-up order qualifier→exception, then guardrail if none yet, then reasoning/distinction/context; one follow-up per region |
| `agents/manifest(.example).json` | `turnTimeout: 15`, `skipTurnDescription` |
| `web/scripts/sync-agents.mts` | Supports `turnTimeout`, `skipTurnDescription`; read-back prints both |
| `web/scripts/probe-agents.mts` | `toolOptional`, `forbidKinds`, `requirePatterns` |
| `agents/probes(.example).json` | 5 new cases: `duplicate-repeat`, `ambiguous-while-explaining`, `after-interpretation`, `usually-exception`, `stale-release` |

**Docs**: `notes/ws3-sprints/docs/contracts-v0.md` (Topic, InterviewConfig, new fields/marks, release protocol, `timing-report.md`), spec-kit artifacts in the spec folder.

## Verification evidence

```
$ npm run typecheck
> tsc --noEmit                                   (exit 0, no errors)

$ npx vitest run
 Test Files  50 passed (50)
      Tests  665 passed (665)

$ npm run sync-agents -- --agent expert
  ⟳ tool begin_question updated (tool_2401m420qgfvft3r1rebp9d4q1t8)
✓ expert (agent_3701m420qeqff2ysp5xh34vfkt5a): 0 docs attached, languages en
  read-back:
    prompt: 8395 chars
    llm: claude-sonnet-5
    toolIds: tool_2401m420qgfvft3r1rebp9d4q1t8  begin_question  [client]
    builtInTools: skipTurn
    turnEagerness: patient  turnTimeout: 15  speculativeTurn: false
    skip_turn description: "Call this instead of speaking whenever you should stay silent: the expert is mid-sentence, mid-explanation or thinking aloud, they paused only briefly, nothing new invites a question, or the live question budget is used up. Calling it means you say nothing this turn."
    tts: eleven_v4_turbo voice cjVigY5qzO86Huf0OWal  expressiveMode: false
    maxDurationSeconds: 1800
    clientEvents: audio, interruption, agent_response, user_transcript, agent_response_correction, agent_tool_response, client_tool_call, agent_chat_response_part, vad_score, tentative_user_transcript
    skip_turn: enabled (builtInTools.skipTurn)

$ npm run probe -- expert --runs 5               (final prompt)
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
```

Sample replies (new cases):
- duplicate-repeat: `skip_turn {"reason": "Already asked explain and guardrail about this same region; expert is just re-pointing at it, nothing new to ask yet."}` and no speech (5/5).
- ambiguous-while-explaining: `begin_question {"event_id":"evt-004","kind":"clarify_reference","question":"Which part are you pointing at there, the dip or the slow rise after it?"}`.
- after-interpretation: `kind: guardrail` — "When would you stop trusting that explanation and think it's something other than warm-up?" (5/5 guardrail).
- usually-exception: `kind: exception` — "You said that drift is usually harmless: when is it not?"
- stale-release: "What do you recognise in the region you pointed at a moment ago on SYS1?"

**Simulated fixture scenario** (`scenario-run.test.ts`, reducer + planner with a scripted expert and a scripted reactive agent; *not* live evidence): releases only at quiet ≥ 1200 ms, one topic at a time (`top-001`, `top-002`, `top-003`); evt-003 stored as alias of evt-001, no own exchange; evt-004's plain first question rejected, first stored exchange `clarify_reference`; processing 0 ms vs. intentional wait ≥ 13.2 s; with the agent's own guardrail follow-up: ≥ 3 live, 1 guardrail, 0 duplicates, 0 interruptions, 0 unlinked.

**Dev-server smoke (port 3102, headless Chromium, no mic):** `/` and `/dev` 200; `/api/conversation-token?flow=expert` returns a token; `/dev` console shows the release gate, tunables, offsets and **Run fixture scenario** (disabled until connected); no console errors or warnings.

## Decisions made (and why)

1. **Branch base** — see the merge note. Sprint 1's gate was pending, so I didn't merge into `voice`. I resolved the `voice` conflicts in this branch.
2. **Release = contextual update + optional nudge.** The capabilities doc (Q1, Q9) shows a contextual update can't trigger a turn, and after `skip_turn` the turn timeout no longer fires. So a released topic could wait until the expert speaks again. When the agent has neither called the tool nor started speaking `nudge_after_ms` (2500) after a release, and the gate still holds, one `sendUserMessage("[CONTROL] …")` gives it a turn. `[CONTROL]` lines are filtered from the expert record. Set `nudge_after_ms = 0` for the pure fallback (contextual release + prompt + turn settings).
3. **Clarify-first is enforced in code**, not only in the prompt: `begin_question` on an ambiguous topic without a prior `clarify_reference` returns an error, and the agent retries.
4. **Questions about a duplicate's id are attributed to the primary event** (`event_id` = primary, `related_event_ids` = aliases). Duplicates are never released, so this mainly guards against agent mistakes.
5. **Dedup clock = client receive time** (`performance.now()` at `event_received`). The window runs from the topic's *newest* event, so repeated re-pointing keeps merging. Same `record_state` is required (on/off-record never merge). There is an IoU epsilon of 1e-9 because normalized coordinates land a few ulps off at exactly 0.5.
6. **"Open" topic:** `released`, or `asked` with no newer topic since the latest ask (`asked_at_perf_ms`, added to `Topic`). A follow-up therefore blocks the next release until it's answered. A released topic the agent doesn't ask about goes to `deferred_to_debrief` when a newer topic arrives (`moved_on`) or after `release_timeout_ms` (30 s).
7. **Budget** = 5 `question_tool_called` per rolling 10 min (prompt range 3–5). It is checked before the pause gate, so overflow defers the topic even while the expert talks. The agent is told with `[STATE] live_question_budget=used_up` and the reverse when the window frees up. The agent's own follow-ups count against the budget but aren't blocked.
8. **"Duplicate question" counter** = more than one spoken question of the same kind on the same topic. **Live questions** count spoken questions only (non-empty `question`).
9. **Processing latency ≈ 0 for fixtures.** Topic creation is synchronous on arrival. The column exists so live WS2 transport/processing delays show up separately from deliberate waiting.
10. **Turn settings:** eagerness `patient`, speculative turn off (unchanged), `turn_timeout` 15 s (API default 7 s would re-engage a thinking expert), plus a custom `skip_turn` description.
11. **`pause_ms` = 1200 (default, not yet tuned live).** You can tune `pause_ms`, `nudge_after_ms` and `mic_threshold` from the console; the values used are stored per session in `interview_config` and printed at the top of `timing-report.md`.

## Contract changes

- `ExpertExchange`: + `topic_id: string | null`, + `related_event_ids: string[]` (both required in new snapshots).
- `SessionSnapshot`: + `topics: Topic[]`, + `interview_config: InterviewConfig`.
- New types: `Topic`, `TopicState`, `DeferredReason`, `InterviewConfig`.
- `TimingMarkName`: + `user_speech_started`, `user_speech_ended`, `topic_nudged`.
- New validators: `validateTopic`, `validateInterviewConfig`; snapshot validation cross-checks topic and related events and exchange `topic_id`.
- Session folder: + `timing-report.md`; `session.json.counts` + derived counters.
- Documented in `notes/ws3-sprints/docs/contracts-v0.md`.

## Known limitations / open issues

- **What the prototype can and cannot detect.** It detects sound and transcript activity: server VAD, tentative transcripts, and the local mic level above a threshold. It **cannot** detect that the expert has finished *thinking*. A silent expert who is still reading the trace looks the same as one who is done. `pause_ms` is a proxy, and the console and report say so.
- **Unverified live (voice):** whether `vad_score` and `tentative_user_transcript` arrive over WebRTC, the scale of `getInputVolume()` (hence `mic_threshold` 0.04), whether a `[CONTROL]` text message comes back as a user transcript (it's filtered either way), and how `skip_turn` and the nudge interact in voice. Probes are text-only. The human gate is the real check.
- **Interruption count depends on the speech detector.** If the detector misses expert speech (threshold too high), interruptions are under-counted. Watch the gate line ("expert speaking") while you talk.
- **Mic level is ignored while the agent speaks** (echo). If the expert talks over the agent, only VAD and tentative transcripts register it.
- **The guardrail question relies on the agent's own follow-up** after the first answer (probe 5/5). The planner never forces a guardrail. The release text reminds the agent while none has been asked.
- **The Sprint 1 worktree uses the same expert agent.** Running the Sprint 1 gate now uses this sprint's prompt. Its events are delivered immediately, which the new prompt tolerates, but restraint will be stricter.
- **Inherited from Sprint 1:** a page reload between sessions avoids the first-line race; `audio_offset_secs` stays null.
- Deferred topics are stored only. The debrief that uses them is Sprint 3.

## Human gate checklist

Prerequisites: none. The worktree's `web/.env` has the working key and the expert agent id, and the agent is synced.

1. `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-2/web && npm run dev -- -p 3102`
2. Open **http://localhost:3102/dev**, keep "Expert capture", press **Start** and allow the mic. Wait for the greeting.
3. Talk briefly and watch the **Release gate** line. It must say "expert speaking" while you talk and "quiet N ms" when you stop. If it never shows "expert speaking", raise the mic sensitivity by lowering `mic_threshold` (e.g. 0.02). If it says "expert speaking" while you're silent, raise it.
4. Press **Run fixture scenario** (offsets 0, 8, 70, 140 s). Talk through a realistic 3–5 minute task:
   - long explanations with thinking pauses;
   - point (in words) at the upper channel around evt-001;
   - keep talking when evt-002 arrives at 70 s;
   - when evt-004 arrives at 140 s, talk about "this whole area".
5. Check:
   - the agent never talks over you;
   - questions come at natural pauses;
   - evt-003 (8 s) does not cause a second question. It shows as "+ duplicates evt-003" under top-001;
   - you're asked which region you mean for evt-004;
   - at least one guardrail question comes (counter "guardrail" ≥ 1);
   - counters: live questions ≥ 3, duplicates 0, unlinked 0, interruptions 0.
6. Press **Stop**. Open `.claude/worktrees/ws03-sprint-2/knowledge/sessions/<session id>/timing-report.md` and confirm:
   - "Interruptions … : 0";
   - *processing ms* is about 0–50, and *intentional wait ms* reflects your pauses (and how long you kept talking);
   - the topics table shows evt-003 as an alias.
   Also check `exchanges.md`: the first evt-004 exchange is `clarify_reference`, and the questions are verbatim.
7. If the agent feels too eager, raise `pause_ms` (e.g. 1500–2000). If it feels too slow, lower `pause_ms` or `nudge_after_ms`. If it never asks after a release, check whether a `[CONTROL]` nudge went out ("nudged" in the topics list). Rerun, then note the final values here.
8. If satisfied, merge from the main checkout once it's clean and no other agent is mid-commit:
   - `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-2` (this includes Sprint 0 and 1)
   - then `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-2` (and the Sprint 0/1 worktrees when you're done with them).
   - After merging, the main checkout's `web/.env` still needs `ELEVENLABS_AGENT_ID_EXPERT=agent_3701m420qeqff2ysp5xh34vfkt5a` and the working key (root `.env` `ELEVEN_LABS_KEY`), as in Sprint 1's note.

## Notes for the next sprint

- **Debrief input:** `topics.filter(t => t.state === "deferred_to_debrief")` with `deferred_reason`. Also consider `queued` topics still waiting when the live phase ends.
- **Phase switch:** use a `ws3-phase` contextual update. While in the debrief phase, stop the release tick (or make `planRelease` phase-aware) so live releases don't collide with debrief questions. Exchanges already carry `phase`.
- **Coverage must ignore `clarify_reference` answers as interpretations** (see the contracts doc).
- The `[CONTROL]` nudge mechanism can be reused to start the debrief turn.
- Counters live in `timing.ts` (`liveCounters`). Extend that function rather than adding parallel counters, so `session.json` and the console stay in sync.
