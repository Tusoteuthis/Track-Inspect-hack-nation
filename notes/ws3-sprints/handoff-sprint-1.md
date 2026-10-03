# WS3 Sprint 1 handoff — Golden path: point → question → answer → saved evidence

Branch: worktree-ws03-sprint-1   Worktree: .claude/worktrees/ws03-sprint-1   Dev port: 3101   Spec: specs/20261004-010622-ws3-sprint-1-golden-path/   Date: 2026-10-04   **Status: ✅ DONE** (agent work complete; awaiting human gate and merge)

> **Merge note:** this branch is based on `worktree-ws03-sprint-0`, not `voice`, because Sprint 0 was not merged when this sprint started (the human approved this). Merging this branch into `voice` brings Sprint 0 along with it. You can merge Sprint 0 first or merge this branch alone.

## Delivered

**Lane A: pure logic and server** (all test-first)

| File | What it is |
|---|---|
| `web/lib/expert/contracts.ts` | `question_planned` on ExpertExchange; types `SessionSnapshot`, `TranscriptEntry`, `UnlinkedQuestion`, `BeginQuestionParams`; validators `validateBeginQuestionParams` (`"none"` → null), `validateExpertExchange`, `validateTimingMark`, `validateSessionSnapshot` (also checks cross-record linkage), `isValidSessionId` |
| `web/lib/expert/context-update.ts` | `formatPointingEventUpdate(event)` builds the one-line `[POINTING_EVENT] …` update with no label, no region and no interpretation. Off-record and ambiguous events get their own instruction tails |
| `web/lib/expert/session.ts` | Pure reducer that owns event ↔ question ↔ answer linkage, the preamble, unlinked questions and timing. Also `toSnapshot`, `newSessionId`, `injectFixture` |
| `web/lib/expert/render.ts` | Renderers for `exchanges.md` and `transcript.md` |
| `web/lib/expert/store.ts` | The `ExpertSessionStore` interface plus an atomic local-file implementation (temp file, then rename). `KNOWLEDGE_DIR` overrides the default `<repo>/knowledge` |
| `web/app/api/expert-sessions/[sessionId]/snapshot/route.ts` | `PUT`: validates the id and the snapshot, checks the id matches, then writes 6 files idempotently |
| `web/lib/expert/fixtures.ts` | The 5 fixture events, bundled for the UI |
| `web/lib/voice/transcript.ts` | Fix: `tentativeTextFrom` now reads the SDK's `{type:"tentative_agent_response", response}` shape |
| `*.test.ts` | Tests: contracts.snapshot (27), session (27), context-update (10), render (7), store (9), fixtures (1), transcript (+3) |

**Lane B: agent config** (done in a nested lane worktree, merged as 676b162)

| File | What it is |
|---|---|
| `agents/expert/system-prompt.md` | Apprentice persona; how to read `[POINTING_EVENT]`; mandatory `begin_question`; pause discipline; no interpretation or leading questions; `clarify_reference` first; off-record; A3 patterns; brevity |
| `agents/expert/first-message.md` | Short greeting: point and talk, occasional questions |
| `agents/expert/tools.json` | `begin_question` client tool: `event_id`, `kind` (enum), `question`; waits for a response, runs immediately, no pre-tool speech, 5 s timeout |
| `agents/manifest.json` (+ example) | Expert agent: `systemPrompt`, `firstMessage`, `tools`, `settings` (llm `claude-sonnet-5`, eagerness `patient`, `speculativeTurn:false`, `maxDurationSeconds:1800`, `expressiveMode:false`, `skipTurn:true`, extra `clientEvents`) |
| `web/scripts/sync-agents.mts` | `--create-missing` can now create an agent from scratch. Upserts tools by name and keeps unmanaged `toolIds`. Applies settings, then prints a read-back |
| `web/scripts/probe-agents.mts` | New `history` cases with `expect` assertions, `toolMockConfig`, and `--runs N` with per-case pass counts. Old `user[]` cases still work |
| `agents/probes.json` (+ example) | Expert probe cases 1–5 |

**Lane C: UI wiring**

| File | What it is |
|---|---|
| `web/components/voice/VoiceSession.tsx` | New optional props only: `onAgentModeChange` and `onDisconnected`. The tutor flow is unchanged |
| `web/components/expert/useExpertSession.ts` | Reducer held in a ref, so the `begin_question` tool always sees the latest state. Delivers fixtures via `sendContextualUpdate(text, {contextId: event_id})`. Saves 1 s after each change (debounced) and immediately on session end, with a save status |
| `web/components/expert/ExpertConsole.tsx` | FIXTURE buttons with thumbnails, session id, events, exchanges (event ↔ question ↔ verbatim answer; ACTIVE badge; unlinked questions in red), timing table, save status, and a raw ContextSender behind a toggle |
| `web/app/page.tsx`, `web/app/globals.css` | Expert flow renders the console; console styles |
| `.gitignore` | `knowledge/sessions/` |

## Verification evidence

```
$ npm run typecheck
> tsc --noEmit                                   (no errors)

$ npm test
 Test Files  8 passed (8)
      Tests  103 passed (103)

$ npm run sync-agents -- --agent expert          (second run, idempotent: tool updated, not duplicated)
  ⟳ tool begin_question updated (tool_2401m420qgfvft3r1rebp9d4q1t8)
✓ expert (agent_3701m420qeqff2ysp5xh34vfkt5a): 0 docs attached, languages en
  read-back:
    prompt: 6131 chars
    firstMessage: "Hi, I'm your apprentice for this session. Just look at the traces, point at whatever matters and talk me through it as you normally would. I'll stay quiet most of the time and ask the occasional short question when you pause."
    llm: claude-sonnet-5
    toolIds:
      tool_2401m420qgfvft3r1rebp9d4q1t8  begin_question  [client]
    builtInTools: skipTurn
    turnEagerness: patient  speculativeTurn: false
    tts: eleven_v4_turbo voice cjVigY5qzO86Huf0OWal  expressiveMode: false
    maxDurationSeconds: 1800
    clientEvents: audio, interruption, agent_response, user_transcript, agent_response_correction, agent_tool_response, client_tool_call, agent_chat_response_part, vad_score, tentative_user_transcript
    skip_turn: enabled (builtInTools.skipTurn)

$ npm run probe -- expert --runs 5               (final prompt, run from the sprint worktree)
═══ summary ═══
  expert/event-silent       5/5
  expert/already-described  5/5
  expert/leading-trap       5/5
  expert/two-events         5/5
  expert/ambiguous          5/5
```

The lane run before the final prompt scored: event-silent 5/5, already-described 0/5, leading-trap 4/5, two-events 5/5, ambiguous 3/5. The fixes were:
- the agent sometimes said "I'll wait…" after the tool call instead of asking
- it added tags like `[curious]`
- the already-described probe had a too-broad "what is it" pattern

Sample replies from the final run:
- two-events, every run: `begin_question {"event_id":"evt-001","kind":"reasoning","question":"What is it about the width and the slow return that makes you flag that one every time?"}`. The expert was talking about evt-001 even though evt-002 arrived later.
- leading-trap: "What do you recognise in this bump?" No cause is named.
- ambiguous: `kind: clarify_reference`, `event_id: evt-004`, e.g. "Sorry, which part are you pointing at just now, the same feature as before or a different region on the trace?"

**Manual checks (dev server on 3101, headless Chromium, no microphone):**
- The page loads with **no console errors or warnings**.
- 5 FIXTURE buttons are shown, thumbnails load, and the buttons are disabled until connected.
- The raw toggle shows the ContextSender. The tutor flow hides the expert console.
- Pressing Start without a mic shows "Microphone access is required to talk to the agent."
- `GET /api/conversation-token?flow=expert` returns a token.

**Snapshot route (curl, using a reducer-generated sample session):**
```
good PUT          → 200 {"saved_at":…,"files":["session.json","events.json","exchanges.json","timing.json","transcript.md","exchanges.md"]}
repeat PUT        → 200 (files identical, no temp files left)
..%2F..%2Fx       → 400 Invalid session id
SES_BAD           → 400 Invalid session id
id ≠ body id      → 400 session_id in the body does not match the URL
invalid body      → 400 with every validation error listed
non-JSON          → 400 Body must be JSON
```
The sample `exchanges.md` showed ex-001 under evt-001 with the verbatim question and both answer lines, including the line spoken after evt-002 arrived. The image link was relative and resolves to `web/public/fixtures/…`. Timing marks were in order. The sample session was deleted afterwards.

## Decisions made (and why)

1. **Branch base is Sprint 0, not `voice`**, because Sprint 0 wasn't merged yet. The human approved this.
2. **A new expert agent was created** (`agent_3701m420qeqff2ysp5xh34vfkt5a`), because no expert agent ID existed anywhere. The human approved creating it via script. The ID is only in the worktree's `web/.env`, which is git-ignored.
3. **Tool name is `begin_question`**, as in the sprint prompt. Sprint 0's doc used `mark_question_target`.
4. **`event_id: "none"` means null.** JSON-schema literal params can't be nullable here; the client maps "none" (and null) to `null`.
5. **The spoken line is the evidence:** the first final agent line after `begin_question` becomes `question`. The tool param is stored as `question_planned` and labelled "AI plan, not evidence" in `exchanges.md`.
6. **Unlinked questions:**
   - Any agent line ending in `?` with no question pending is flagged. This includes a second question inside the same exchange.
   - `agent_speech_started` is logged for every speech start and is linked to the pending or active exchange.
7. **Event delivery uses a contextual update with `contextId = event_id`,** following Sprint 0's verified finding that a shared id supersedes earlier updates.
8. **Off-record events** get a "do not ask about it" tail. If the agent asks anyway, the exchange keeps `record_state: off_record`. It is not excluded yet; that is Sprint 4.
9. **Probes** inject `[POINTING_EVENT]` as a user-role turn, because contextual updates can't be simulated (Sprint 0). In event-silent the expert says "Hmm.", since a simulation can't model silence.
10. **Settings added beyond the prompt** (found by Lane B):
    - `expressiveMode:false`. The v4 TTS default adds `[curious]`-style tags, which would pollute the verbatim question.
    - `client_tool_call` added to `clientEvents`. It is not a default on new agents, and the tool wouldn't reach the browser without it.
    - `skip_turn` set via `agents.update`. It stuck this time and the read-back confirms it.
11. **SDK and API quirks worked around in `sync-agents`:**
    - Echoing `prompt.tools` together with `toolIds` is rejected (400). The script now sends only `toolIds`.
    - The SDK serializer rejects `eleven_v4_turbo` because its enum is behind. tts is patched with `{expressiveMode}` only.

## Contract changes

- `ExpertExchange.question_planned: string | null` (new). `question` may be `""` until spoken.
- New types: `SessionSnapshot`, `TranscriptEntry`, `UnlinkedQuestion`, `BeginQuestionParams`, and the constant `NO_EVENT = "none"`.
- New validators: `validateBeginQuestionParams`, `validateExpertExchange`, `validateTimingMark`, `validateSessionSnapshot`, `isValidSessionId`.
- `notes/ws3-sprints/docs/contracts-v0.md` is updated: SessionSnapshot, `begin_question`, and the on-disk layout as implemented.

## Known limitations / open issues

- **Live linkage is not yet verified by voice.** Probes are text-only, so the human gate is the real check.
- **Simulated agent text has odd spacing** ("base line", "r est"). This looks like a simulation streaming artefact; the gate should check that live `agent_response` text is clean, because it becomes the verbatim `question`.
- **Restraint comes from the prompt only.** There is no topic queue or pause gate yet; that is Sprint 2.
- **First line of a second conversation can be lost to the old session.** If the expert stops and restarts in the same page, and the new agent's first line arrives before the `onConnected` effect, that line lands in the old, ended session. Reloading the page between sessions avoids this.
- `audio_offset_secs` stays `null`. The post-call cross-check via `conversations.get` is not built.
- `agents/manifest.json` still has the tutor entry (cloneFrom expert). Always run sync with `--agent expert`. The tutor ID is empty, so a full sync skips the tutor unless `--create-missing` is given.

## Human gate checklist

Prerequisite: none. The worktree's `web/.env` already has the working key and the new expert agent ID.

1. `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-1/web && npm run dev -- -p 3101`, open http://localhost:3101, choose "Expert capture", press Start and allow the mic. The agent greets you, and the console shows a session id.
2. Click the **evt-001** FIXTURE button and talk about it for about 20 s, then pause.
   - **Check:** the agent waits, then asks **one** short question without interpreting the trace.
   - **Check:** the console shows `ex-001 ↔ evt-001` with that question verbatim, and there is no red UNLINKED card.
3. Answer it. While you're still answering, click **evt-002**.
   - **Check:** your answer lines keep appearing under `ex-001 ↔ evt-001`.
   - **Check:** evt-002 appears only in the events list.
4. Optional: click **evt-004** (ambiguous). The agent should ask which region you mean.
5. Press Stop. The save status should read "saved hh:mm:ss".
6. Open `.claude/worktrees/ws03-sprint-1/knowledge/sessions/<session id>/exchanges.md`.
   - **Check:** the question and your words are verbatim, under the right event, with timing marks.
   - **Check:** the folder has all six files.
   - Also look at the spacing of the question text (see the open issue above).
7. If you're satisfied, merge from the main checkout once it's clean and no other agent is mid-commit:
   - `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-1` (this includes Sprint 0)
   - then remove both worktrees with `git worktree remove …/ws03-sprint-1` and `…/ws03-sprint-0`.
8. After merging:
   - Add `ELEVENLABS_AGENT_ID_EXPERT=agent_3701m420qeqff2ysp5xh34vfkt5a` to the main checkout's `web/.env`.
   - Replace its rejected `ELEVENLABS_API_KEY` with the working key, which is the root `.env` `ELEVEN_LABS_KEY`.

## Notes for the next sprint

- **Topic queue (Sprint 2):**
  - Hook it in at `deliverFixture` in `useExpertSession.ts` and in `event_received` in the reducer.
  - Today events are sent to the agent immediately.
  - The timing marks `topic_queued` and `topic_released` already exist in the contracts.
  - For state, use the fixed context ids `ws3-state` and `ws3-phase` (see the capabilities doc).
- **Probe harness:**
  - It now supports `--runs N` and assertions (`toolCalled`, `eventId`, `kind`, `forbidPatterns`, `maxQuestions`).
  - Add Sprint 2 cases for restraint: mid-sentence → `skip_turn`/silence, and no repeated questions.
- **Defect signal:** count unlinked questions per session. `session.json.counts.unlinked_agent_questions` is the place.
- **WS6:** replace `createFileStore` behind `ExpertSessionStore`. The route is the only caller.
