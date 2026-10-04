# WS3 Sprint 5 — Strategy alignment: bounded questioning and expert control

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 5**. Sprints 0–4 built a working expert interview. They are merged into `voice` (merge `004a24d`), but their live voice gates are still pending.

This sprint aligns the interview with the strategy paper `notes/voice-agent-strategy-handoff.md`. The governing principle comes from the user, and it is a **correction**, not a suggestion:

> Let the expert lead. Ask a small number of questions that capture important reasoning, then move on, even if some uncertainty remains.

The app must stop asking **endless questions**:
- The app enforces the question limits; the prompt alone is not enough.
- The expert gets spoken controls to steer the agent.
- Questions are never repeated, not even in different words.
- Leaving something unresolved is a valid outcome.

**Never add any behavior that keeps the session going until a coverage checklist is complete.**

Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **5**
- Slug = **strategy-alignment**
- Branch = **`worktree-ws03-sprint-5`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-5`**
- Dev-server port = **3105**

**First action:** run the A6 location check at the bottom of this prompt.

## Read first

- `notes/voice-agent-strategy-handoff.md`, all of it, especially §1 (the correction), §6 (budgets), §7 (triggers and the 7-point "before speaking" check), §8 (question bank), §10 (question state), §11 (bounded debrief) and §15 (rehearsal table)
- `notes/ws3-sprints/handoff-sprint-4.md` (and 2, 3)
- `agents/expert/system-prompt.md`, `agents/expert/first-message.md`, `agents/expert/tools.json`, `agents/manifest.json` (expert `settings`), `agents/probes.json` (expert cases)
- In `web/lib/expert/`:
  - `contracts.ts`, `session.ts` (`reduceSession`, `beginQuestion`), `topics.ts` (`findDuplicateTopic`, `ingestEvent`, `planRelease`, `budgetState`)
  - `coverage.ts` (`DEBRIEF_MAX_GAPS`, `debriefAgenda`, `selectGaps`), `debrief.ts`, `completion.ts` (`deriveCompletion`), `context-update.ts`, `record-state.ts` (a spoken-phrase detector to model new controls on), `interview-config.ts`, `timing.ts`
- `web/components/expert/useExpertSession.ts` and `ExpertConsole.tsx`
- `web/lib/knowledge/cues.ts` (WS5 `findQualifiers` and the hedge finders; reuse, don't duplicate)

## Prerequisites

Sprints 2–4 are merged into `voice` (`004a24d`, pushed). Their live voice gates are still open. Running the S2–S4 gates before or alongside this sprint is fine: this sprint changes the behaviour those gates check, so note in the handoff which gate steps changed.

## Decisions already taken by the user (fixed inputs; don't re-ask)

| # | Decision |
|---|---|
| D1 | **Live budget: fixed cap of 5 questions per session** (replaces the rolling 5 per 10 min). Orientation questions do not count. |
| D2 | **Per topic: 1 opening question + at most 1 follow-up.** Pointing at the region again never resets this allowance. |
| D3 | **Topic = same region on the same trace and channel (IoU ≥ `dedup_min_iou`), with no time window.** The same-looking feature on a different trace is a new topic. |
| D4 | **`clarify_reference`** is asked only when the expert has not already made the region clear by what they said. It **does not use** the topic's follow-up, but it **does count** toward the session cap of 5. |
| D5 | **Orientation: at most 2 questions**, each skipped if already answered. |
| D6 | **Debrief: 3 gaps**, ranked by priority, and the rest are dropped as unresolved. If **no guardrail question was asked live**, the first debrief slot is a guardrail gap. |
| D7 | **Teach-back: one correction pass.** If the expert still hasn't confirmed after it, the session ends in the existing `incomplete` state. The latest revision is kept as a draft, and the unconfirmed steps are listed as unresolved. No new status. |
| D8 | **Enforcement is in the tool, backed by probes.** `begin_question` refuses with a reason, and the agent must then `skip_turn`. The console flags any agent turn that speaks a `?` without a preceding `begin_question`. No audio muting. |
| D9 | **`[CONTROL]` nudge: only for silent pointing.** It fires only if the expert has said nothing since the gesture, at most once per topic, and only within budget. |
| D10 | **Guardrail is a soft priority** during the live task (preferred when a follow-up is warranted, never mandatory). D6 is the backstop. The completion report flags the challenge shortfalls honestly (< 3 live questions, no guardrail) and never pads them. |
| D11 | **Interaction preferences: spoken overrides only**, plus mirror buttons in the console. No upfront preference questionnaire. |

## Scope

### 1. Budget and question-state enforcement in the reducer (test-first)

Strategy §6 and §10.

Add a pure `checkQuestionAllowed(state, params, now)` that returns `{ ok: true } | { ok: false; reason }`. `beginQuestion` calls it before creating an exchange. On refusal:
- set `last_tool_result` to `declined <reason>: do not ask; call skip_turn`;
- record a `question_declined_by_app` timing mark;
- create **no** exchange.

Refusal reasons, in check order:
1. `listen_only`: the expert said "just listen" (see 3).
2. `off_record`: already handled; keep it.
3. `session_budget`: D1. Count live `begin_question` successes for the whole session, including `clarify_reference`, and excluding orientation, debrief and teach-back questions.
4. `topic_followup_used`: D2. Per topic, count the non-`clarify_reference` exchanges. The opening question plus 1 follow-up is the maximum, so a third is refused.
5. `topic_closed`: the topic was closed by "next" or "skip that" (see 3), or was deferred.
6. `repeat`: the same topic + `kind` was already **answered** or **declined**. Strategy §10 says to deduplicate by meaning; the topic + kind pair is our deterministic proxy for meaning. The prompt covers paraphrases.
7. `phase_budget`: orientation > 2 (D5), debrief beyond its agenda (D6), or teach-back correction > 1 (D7).

Replace the rolling window:
- `budgetState` becomes session-level.
- Remove `budget_window_ms` from `InterviewConfig`. Keep the parser accepting it and ignoring it, so old snapshots and URLs still load.
- Add `topic_max_followups` (1), `orient_max_questions` (2), `debrief_max_gaps` (3) and `teach_back_max_corrections` (1) to `InterviewConfig`.

Add a per-exchange question **outcome**: `answered | declined | deferred | dropped`, set as follows:
- `declined`: the expert said "skip that".
- `deferred`: the topic was deferred.
- `dropped`: a strike or a closed topic.

This is a `ws3.v2` contract bump. Update `notes/ws3-sprints/docs/contracts-v0.md` and list every changed field for WS5/WS6. Check that the WS5 code in `web/lib/knowledge/` still typechecks: it consumes these types, and the S4 merge needed seam fixes there.

### 2. Topic identity and the nudge (test-first)

- **D3:** in `findDuplicateTopic`, drop the `dedup_window_ms` condition and add a check that `trace_id` matches. Both `trace_id` and `channel_id` are nullable: two nulls do **not** count as a match, so treat an unknown trace as a new topic. Keep `dedup_window_ms` in the config only if something else uses it; otherwise remove it as described in 1.
- **D9:** `planRelease` may return `nudge` only when no expert speech (`user_speech_started` or a final user line) has occurred since the gesture's `event_received` and the session budget is not exhausted. A nudge that leads to a question counts toward the budget like any other question, because the question goes through `begin_question`.
- **D4:** the `requires_clarification` gate in `beginQuestion` currently *forces* `clarify_reference` first. Change it so the tool **no longer rejects** a non-clarify question on an ambiguous topic once the expert's answer lines have named a channel or trace. A simple deterministic check is fine, for example the expert's words contain the topic's channel id ("SYS1"/"SYS2") or "both". Otherwise keep requiring it. Update the prompt so that the agent asks the clarifying question only when the reference is still unclear.

### 3. Expert controls (spoken and console; test-first for detection)

Model these on `record-state.ts` `detectRecordPhrase`. Use a deterministic phrase detector on final user lines, plus a client tool so that the agent can also trigger them.

| Control | Example phrases | Effect |
|---|---|---|
| Listen-only on | "just listen", "no questions for now", "let me just talk" | `listen_only = true`. Every `begin_question` is refused. Releases are paused, and topics stay queued and are deferred to the debrief. Sends `[STATE] mode=listen_only`. The agent acknowledges once ("Okay, I'll just listen."). |
| Listen-only off | "you can ask again", "questions again", "go ahead and ask" | `listen_only = false`. Sends `[STATE] mode=questions`. No catch-up burst: at most the normal one question at the next pause. |
| Skip | "skip that", "skip it", "not now", "pass" | Marks the active exchange's outcome `declined`, if it is still unanswered. Otherwise marks the last asked one. The kind is now blocked as a `repeat` on that topic. No acknowledgement beyond silence or "Okay." |
| Next | "next", "next one", "moving on", "let's move on" | Closes the current open or released topic (`topic_closed`). Pending releases for it are dropped. Its remaining gaps stay for the debrief, unless the debrief cap drops them. |
| Finish | (exists) | Keep the `signal_task_complete` behavior. Make sure "finish" also works while `listen_only` is on. |

- Add a client tool `set_interaction_mode({ mode: "listen_only" | "questions" })` and a tool `close_topic({ reason: "skip" | "next" })` to `agents/expert/tools.json`. Their results return the new state line.
- The phrase detector is the primary path. The tools exist only for phrasings the detector misses.
- Both paths must be idempotent, so that detector + tool for the same utterance apply once.
- Add console buttons: Just listen / Questions again / Skip / Next. The console shows the acknowledged mode, not a local toggle (the same rule WS7 uses for off-record).
- Update `first-message.md` to mention only the controls that actually work (strategy §5), in one short sentence, for example: "Say 'just listen', 'skip that', 'next', 'off the record' or 'I'm done' anytime."

### 4. Orientation step (D5)

- Add `SessionPhase` value `orient`, before `live`. Orientation ends at the first pointing event, after 2 orientation questions, or when the expert starts explaining a trace.
- **Agent:** may ask at most 2 of these, each only if it's not already answered:
  - "What decision are you trying to make from these traces?"
  - "Anything I should know about the channels or axes before we start?"
  - "Where do you normally look first?"
- Orientation questions use `begin_question` with `phase: "orient"` and `event_id: "none"`. They are **not** counted as live screen-grounded questions in `liveCounters` or `demo-evidence`.
- The expert's answers are kept as session context: transcript plus exchanges with `phase: "orient"`. WS5 can use them later, but they are not evidence-linked steps.

### 5. Bounded debrief and teach-back (D6, D7, test-first)

- `DEBRIEF_MAX_GAPS` changes from 5 to `config.debrief_max_gaps` (3). In `debriefAgenda`, rank the gaps by priority, apply the D6 guardrail-first rule, and mark the dropped candidates as `dropped` on the agenda. They become unresolved items, never questions. Remove the prompt sentence "Ask at least three debrief questions if the agenda has three gaps" and say instead "ask only the listed gaps".
- **Teach-back:**
  - Track the correction passes. After `teach_back_max_corrections` corrected revisions, the next `confirm_revision(corrected)` or `unresolved` ends the teach-back: the session phase becomes `incomplete`. The tool result tells the agent to thank the expert and say the draft is saved for review.
  - `deriveCompletion` lists the steps of the latest revision that were not confirmed under `unfinished`.
  - Silence is still never a confirmation.

### 6. Prompt rewrite (`agents/expert/system-prompt.md`)

Keep everything in the prompt that still holds: off-record, strike, the `begin_question`-first rule, no interpretation. Then make these changes:
- **Add, near the top: the governing principle** from "Your role", and the 7-point "before speaking" check from strategy §7, condensed.
- **Replace** the "When to ask" default-follow-up ladder:
  - The guardrail becomes a soft priority (D10).
  - A follow-up is asked only when the answer left a **material** gap: missing meaning, missing main cue, or an unexplained qualifier.
  - "Meaning + main cue captured → move on" is the default (strategy §6, "What is sufficient for a region?").
- **Add the conditional question bank** from strategy §8 as patterns, each with its "ask only when" condition. Keep it compact. Cover these wording triggers:
  - "just noise" / "ignore this"
  - "maybe" / hesitation
  - comparisons between regions
  - threshold crossings
  - stated physical causes
  - numeric values
  - "usually" / "except" / "unless" / "only when"
  - intuition ("it just looks wrong")
- **Add a section on declined tool results:** when `begin_question` returns `declined …`, call `skip_turn` and say nothing. Never rephrase the question, and never say that you were stopped.
- **Add sections on the controls (3) and orientation (4).**
- **Remove:**
  - "Do this even if the expert is already explaining it" (D4)
  - "if no guardrail question has been asked yet in this session, ask a guardrail question" (D10)
  - "Ask at least three debrief questions…" (D6)
- **Optional:** tag final user lines that contain a qualifier or hedge with a background-only `[CUE] qualifier="usually"` context line, using WS5 `findQualifiers`. Do this only if it measurably helps the probes. Otherwise leave it out and say so in the handoff.

### 7. Agent config (`agents/manifest.json` expert `settings`)

- `turnEagerness: "patient"` is already set. Verify it on the live agent after sync.
- **Filler speech off:** find the ElevenLabs soft-timeout / filler setting in the installed SDK typings (`web/node_modules/@elevenlabs/elevenlabs-js`) and in `notes/ws3-sprints/docs/elevenlabs-capabilities.md`.
  - If it exists, add a `softTimeout`-style manifest setting to `sync-agents.mts`, default it to disabled for the expert, and sync.
  - If it doesn't exist or isn't settable, document that in the handoff. **Never invent API surface.**
- Update `skipTurnDescription` to include "the app declined the question" and "listen-only mode".

### 8. Console violation flag (D8)

In `useExpertSession`, if an agent final line contains `?` and no `begin_question` was called since the agent's previous final line (outside the teach-back delivery), record a `question_without_tool` timing mark. Show a counter in the console. Add it to `timing.ts` `liveCounters`, `demo-evidence.md` and `completion.md` as "questions not routed through the app".

### 9. Probes (`agents/probes.json`, expert; each ≥ 4/5)

Add these cases using the existing `Expect` fields (`forbidTools`, `requireTools`, `maxQuestions`, `toolOptional`, `requireReply`, `forbidPatterns`). They mirror strategy §15:

1. Already explained: the expert points and fully explains meaning + cue + condition. Expect no question, or at most one deeper question, never "what is this".
2. Repeated pointing at an answered region: expect no repeated question of the same kind.
3. The `begin_question` mock returns `declined session_budget`: expect `skip_turn`, no spoken `?`, no paraphrase.
4. "skip that" right after a question: expect no re-asking of the same question, `close_topic`/skip handled, at most "Okay."
5. "next": expect no question about the previous topic.
6. "just listen", then a pointing event: expect `set_interaction_mode listen_only`, then silence on the event.
7. "questions again": expect mode restored and no burst of questions.
8. "I'm done" during the live part with `listen_only` on: expect `signal_task_complete`.
9. Debrief with a 3-gap agenda: expect only agenda `gap_id`s (`allowedGapIds`).
10. A second correction in the teach-back after one pass: expect no third `propose_draft`; `confirm_revision corrected/unresolved` and a short close.
11. Orientation: the expert's first line already states the decision. Expect no orientation question about the decision.
12. "That's just noise": expect at most one question, of the "what tells you it can be ignored" kind, never a suggested cause.

Re-run **all existing expert probes** and report the counts. No regressions below 4/5.

## Out of scope

- WS5 synthesis or tutor logic.
- WS6 backend budget enforcement. The enforcement stays client-side in the reducer; document that WS6 may mirror it later.
- WS7 polished UI.
- Glasses audio routing.
- Any new knowledge-extraction goal.

## Acceptance criteria

- `npm run typecheck` and `npm test` pass. Tests cover:
  - each refusal reason in `checkQuestionAllowed`, including that a re-point doesn't reset the topic allowance (D2, D3)
  - that `clarify_reference` counts toward the session cap but not the follow-up (D4)
  - a 6th live question refused (D1)
  - orientation questions not counted as live (D5)
  - the debrief agenda capped at 3, with guardrail-first when none was asked live (D6)
  - the second correction ends the session as `incomplete` with the unconfirmed steps listed (D7)
  - the nudge suppressed when the expert has spoken since the gesture (D9)
  - the control phrase detector: positive and negative cases, including "next" inside an unrelated sentence such as "the next dip", which must **not** trigger
  - idempotent controls
  - the `question_without_tool` mark
  - the `ws3.v2` contract round-trip
- The WS5 `web/lib/knowledge` tests still pass.
- All new probes and all old expert probes pass ≥ 4/5, with the counts pasted.
- The prompt, tools and manifest are synced to the **expert** agent only, and the live settings are read back.
- `contracts-v0.md` is updated to `ws3.v2`. Handoff `notes/ws3-sprints/handoff-sprint-5.md` is written, including a **strategy §15 rehearsal table** with the status of each row (unit-tested / probed / live-gate only).

## Human gate (for the human, ~30 min)

1. Run `cd <worktree>/web && npm run dev -- -p 3105` and open http://localhost:3105. Use the fixture traces: one clear example, one confusable example, one boundary case.
2. Point and explain fully. The agent should stay quiet, or ask at most one deeper question.
3. Point silently. One opening question should come at the pause.
4. Point at the same region again. There should be no new question.
5. Say "skip that" after a question. It should never come back.
6. Say "next". The old topic should stay quiet.
7. Say "just listen" and point twice. There should be silence. Then say "questions again". At most one question should come at the next pause.
8. Keep going until the console shows 5/5 live questions. The agent should stay silent from then on.
9. Say "I'm done". The debrief should have ≤ 3 questions. Correct the teach-back twice. After the second correction it should end as incomplete, and `completion.md` should list the unconfirmed steps.
10. Check that the console's "questions not routed through the app" counter shows 0.
11. If satisfied, merge from the main checkout once it's clean: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-5`. Then remove the worktree.

---

## A. Shared project context (identical in every WS3 sprint prompt)

### A1. The product in one paragraph

We are building an **AI Apprentice for railway sensor traces** for Challenge 1 ("The AI Apprentice") of the 7th Global AI Hackathon, powered by ElevenLabs. An experienced railway engineer (the **expert**) wears **Meta Ray-Ban smart glasses** and looks at **sensor traces on a screen**. They **physically point with a finger** at a trace region. A connected iPhone application (workstream WS2) detects the gesture in the glasses' camera feed, captures the region and emits a **PointingEvent**. An **ElevenLabs voice agent** (our workstream, **WS3**) asks the expert to explain what they see, then asks about reasons, distinctions, exceptions and guardrails. After a spoken **debrief** and a **teach-back** that the expert **confirms or corrects**, the confirmed knowledge is saved as Markdown plus linked images. A separate tutor (WS5) later uses it to teach a newcomer on an unseen trace.

Core loop: *expert points → app identifies the visual reference → voice agent asks → expert explains → apprentice clarifies and confirms → knowledge is persisted → newcomer learns.*

### A2. Non-negotiable scope rules

- **Sensor traces only.** No technical drawings, field maintenance, dataset labeling or classifier training.
- **Glasses-first, physical finger pointing.** Never redesign the expert experience around mouse clicks, a cursor or a conventional screen-sharing assistant. A browser companion page is fine for development and for controls.
- **The expert supplies the interpretation.** The agent must never invent or suggest what a curve means. No leading questions that insert an unconfirmed physical interpretation.
- **Expert wording is preserved verbatim and kept separate from AI summaries.** Never synthesize a quote. Never turn a qualified statement ("usually", "only if") into an absolute rule. Missing values stay missing (`null`), never guessed.
- **Session time ≠ signal time.** "The expert pointed at 02:15 in the recording" (`session_time_ms`) is not "the feature spans 120–150 ms on the trace" (`signal_interval`). Never derive one from the other.
- **An ambiguous pointing event is never treated as resolved.** Clarify the visual reference before interpreting the answer.
- **Fixtures must be labeled as fixtures.** Simulated pointing events are fine during development, but every record created from a fixture carries `source: "fixture"`, and the demo must show what is live and what is a fixture.
- **WS4's evaluator answer key is never loaded into the agent**, its prompt, its knowledge base or its tools.
- **No permanent ElevenLabs API key in the browser.** The browser only receives short-lived conversation tokens from the existing server route.

### A3. Challenge requirements WS3 must make demonstrable

| Requirement | Detail |
|---|---|
| Live questions | ≥ **3** questions during the real task, each at a natural pause, each about something visible (a pointing event) |
| Guardrail | ≥ **1** of the live questions concerns a guardrail (when to stop, escalate, distrust the evidence) |
| Debrief | ≥ **3** follow-up questions after the task about matters **not already answered** live |
| Teach-back | Final spoken teach-back that the expert explicitly **confirms or corrects**; silence is not confirmation |
| Evidence | Every workflow step and guardrail links to a screen moment (event) **and** the expert's own words (exchange) |
| Interruption restraint | Fixed cap of 5 live questions per session (Sprint 5, D1); others deferred to the debrief or left unresolved; never interrupt ongoing speech; no repeated questions, not even reworded |
| Trust | Off-record content excluded consistently from recording and knowledge paths; corrections propagate |

Useful question patterns (patterns, not a script): "What do you recognize in this region?", "Which part of the shape makes you interpret it that way?", "What could look similar, and how would you distinguish it?", "What additional context do you need before deciding?", "When would you stop and ask someone else?", "You said 'usually' — what are the exceptions?". Do not keep asking "why?" once the reasoning has been given.

### A4. Workstream map (who owns what)

| WS | Owns | Relationship to WS3 |
|---|---|---|
| WS1 | Pitch, business case | Consumes our demo transcripts and verified claims |
| WS2 | Glasses/iPhone capture, gesture detection, PointingEvent | **Produces** PointingEvents; we use fixtures until live |
| WS3 (**us**) | Expert conversation, ElevenLabs adapter, timing, debrief, teach-back, confirmation | — |
| WS4 | Prototype trace scenarios, evaluator answer key | Supplies scenarios; answer key must stay out of our agent |
| WS5 | Knowledge synthesis, Work Map, newcomer tutor | **Consumes** our exchanges/confirmations; will later replace our in-memory coverage tracker |
| WS6 | Shared backend (does not exist yet) | Will take over our local-file persistence later; keep it behind a small interface |
| WS7 | Web frontend | Will build the polished UI; our UI is a functional dev/companion page |

Full briefs, if you need more detail: `notes/project-brief.md`, `notes/03-elevenlabs-expert-interaction.md` (our brief), `notes/02-glasses-iphone-visual-processing.md` (PointingEvent contract, §5), `notes/05-knowledge-newcomer-tutor.md` (knowledge entry structure, §3–5), `notes/06-backend-integration.md`. The overall WS3 sprint plan is `notes/ws3-sprints/sprint-plan.md`.

### A5. Repository state you start from

Repo root (shared main checkout, **read-only for you**, see A6): `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`. Base branch for all WS3 work: **`voice`**. You work in your own worktree branched from `voice`.

```
agents/                       ElevenLabs agent config (manifest.example.json, probes.example.json, tts-samples.example.json)
notes/                        Briefs and plans (read-only for you unless the sprint says otherwise)
web/                          Next.js 16 / React 19 / TypeScript app (path alias "@/*" → web/*)
  app/api/conversation-token/route.ts   GET ?flow=expert|tutor → short-lived WebRTC token (uses ELEVENLABS_API_KEY server-side)
  app/page.tsx                          Flow picker + <VoiceSession> + dev "ContextSender" (sends free-text sendContextualUpdate)
  components/voice/VoiceSession.tsx     ConversationProvider wrapper: start/stop orb, live transcript,
                                        props: flow, dynamicVariables, clientTools, onFinalLine, onConnected, children
                                        (children are inside the provider and may call useConversationControls())
  lib/voice/flows.ts                    FLOWS = { expert, tutor } → env var holding the agent id
  lib/voice/transcript.ts               finalLineFrom/tentativeTextFrom/appendFinal/appendTentative; TranscriptLine has `at` (epoch ms)
  scripts/sync-agents.mts               npm run sync-agents [-- --agent expert] [-- --create-missing]
                                        pushes systemPrompt / firstMessage / knowledge docs from agents/manifest.json to ElevenLabs
  scripts/probe-agents.mts              npm run probe [-- expert] — TEXT-ONLY simulated conversations via
                                        client.conversationalAi.agents.simulateConversation; prints agent reply + tool calls;
                                        cases from agents/probes.json
  scripts/tts-roundtrip.mts             npm run tts-roundtrip — TTS → Scribe round trip (can synthesize test "expert" audio)
  .env.example                          ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID_EXPERT, ELEVENLABS_AGENT_ID_TUTOR
.specify/ + .claude/skills/speckit-*   spec-kit 1.0.4 (sequential feature numbering; creates specs/NNN-name/ and a feature branch)
```

Packages: `@elevenlabs/react` ^1.16, `@elevenlabs/elevenlabs-js` ^2.70, `next` ^16.1, `react` ^19.2, `tsx`, `typescript`. Code style: small focused modules, comments only where the "why" is non-obvious, strict TypeScript, no `any`. Match the existing style in `VoiceSession.tsx` and `transcript.ts`.

**Never invent ElevenLabs API surface.** Check the installed SDK typings in `web/node_modules/@elevenlabs/...` and the official ElevenLabs docs, plus `notes/ws3-sprints/docs/elevenlabs-capabilities.md` once Sprint 0 has produced it. If something you need does not exist, say so and choose a documented fallback.

### A6. Git worktree isolation (MANDATORY — other agents work in this repo in parallel)

Several agents work on this repository **at the same time**. The main checkout (`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, branch `voice`) is shared, and other agents may be editing files or committing there right now. To avoid corrupting their work, **you work only in your own git worktree.**

**Hard rules**
- **Never** run `git checkout`, `git switch`, `git reset`, `git stash`, `git clean`, `git rebase`, `git merge` or `git pull` in the main checkout. Don't edit, create or delete files there. Don't run `npm install` or `npm run dev` there.
- **Never** touch another agent's worktree or branch. Don't delete branches or worktrees you didn't create.
- All file edits, commands, tests, dev servers and commits happen **inside your worktree directory**.
- Only push config to the **expert** ElevenLabs agent (`npm run sync-agents -- --agent expert`). Never touch the tutor agent or any other agent.

**Recommended start: the human launches you inside your worktree.** The human may already have created your worktree and started you in it. That is the safest setup, because your whole session (shell, file paths, spec-kit scripts) then lives in the worktree. You may also have been started in the main checkout. Either way, run this **before doing anything else** (replace `N` and `<slug>` with the values from "Worktree identity"):

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
WT_ROOT=$REPO/.claude/worktrees
WT=$WT_ROOT/ws03-sprint-N
BR=worktree-ws03-sprint-N
HERE=$(git rev-parse --show-toplevel)
CUR=$(git branch --show-current)

if [ "$HERE" = "$WT" ] && [ "$CUR" = "$BR" ]; then
  echo "OK: already in my worktree ($WT on $BR); skip creation"
elif [ "$HERE" = "$REPO" ]; then
  echo "Started in the MAIN checkout; creating/using my worktree"
  if git -C "$REPO" worktree list | grep -q " $WT "; then
    echo "worktree exists already"
  else
    mkdir -p "$WT_ROOT"
    git -C "$REPO" worktree add -b "$BR" "$WT" voice
  fi
else
  echo "STOP: unexpected location $HERE on branch $CUR; ask the human"
fi
```

- **If it printed STOP:** stop and ask the human.
- **If the worktree exists but is on a different branch than `$BR`,** or `$BR` already exists elsewhere: stop and ask the human. Never force, reset or delete anything.
- **If you were started in the main checkout:** from now on, **every** shell command starts with `cd "$WT" && …`, and **every** file path you read, edit or write must start with `$WT/`, never with `$REPO/`. Run spec-kit commands (`/speckit-*`) only after `cd "$WT"`. Before each commit, check that `git -C "$REPO" status --short` shows none of your files.

Then, in the worktree, set up what git does not carry over:

```bash
cd "$WT"
[ -f web/.env ] || cp "$REPO/web/.env" web/.env 2>/dev/null || echo "web/.env missing: ask the human"
[ -f agents/manifest.json ] || { [ -f "$REPO/agents/manifest.json" ] && cp "$REPO/agents/manifest.json" agents/; }
[ -f agents/probes.json ]   || { [ -f "$REPO/agents/probes.json" ]   && cp "$REPO/agents/probes.json" agents/; }
[ -d web/node_modules ] || (cd web && npm ci)
```

**Checks after setup.** If any check fails, stop and ask the human; don't copy files from the main checkout to work around it.
- `ls notes/ws3-sprints/` shows the sprint prompts, and the previous sprint's `handoff-sprint-(N-1).md` exists (except for Sprint 0).
- `ls .specify .claude/skills` shows spec-kit. If it's missing, the spec-kit setup hasn't been committed to `voice` yet.
- `git -C "$WT" status` is clean and on `$BR`.

**Dev server.** Use a sprint-specific port so you don't collide with other agents: `npm run dev -- -p 310N` (Sprint 0 → 3100, Sprint 1 → 3101, …). Use that URL in the human-gate instructions.

**Spec-kit inside the worktree.** Spec-kit 1.0.4 here does not create git branches; it creates `specs/NNN-name/` and a local `.specify/feature.json`. Your branch is already `$BR`. Other agents also create specs in parallel, so sequential numbers would collide on merge. When `/speckit-specify` runs `create-new-feature.sh`, pass `--timestamp --short-name ws3-sprint-N-<slug>`. If the skill doesn't let you pass flags, rename the created directory afterwards to `specs/<timestamp>-ws3-sprint-N-<slug>/` and update `.specify/feature.json` to match.

**Subagents for lanes.** Subagents work inside **your** worktree: run them sequentially if they touch the same files. For true parallelism, give each lane its own nested worktree under `$WT_ROOT/ws03-sprint-N-lane-X`, branched from `$BR`, and merge the lanes into `$BR` yourself. These lane worktrees and branches are yours to create and remove.

### A6b. How every WS3 sprint is executed

1. Read this whole prompt, then do the A6 worktree setup and checks.
2. Read the files listed under "Read first" in the sprint section, **from your worktree**.
3. Use spec-kit for the sprint: run `/speckit-specify` with the sprint's goal and scope (paste the "Scope" and "Acceptance criteria" sections as the feature description; naming per A6). Then `/speckit-clarify` only if something is truly ambiguous, then `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`. Keep the specs consistent with this prompt; this prompt wins on conflicts.
4. Where the sprint lists **lanes**, they are independent once the contracts are fixed. Parallelize them following A6 "Subagents for lanes", then integrate.
5. Use test-driven development for all pure logic (vitest). Run the verification commands below before claiming anything works, and paste actual outputs into the handoff note.
6. Commit in small logical commits on `$BR`, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not merge into `voice`, do not push, and do not remove your worktree.** The human merges after their live gate.
7. Finish by writing the sprint handoff note `notes/ws3-sprints/handoff-sprint-N.md` (template in A8) in your worktree and committing it. Then stop and report to the human with:
   - the worktree path
   - the branch name
   - the dev-server port
   - exactly what they must do for the **human gate**, including running the gate from the worktree (`cd $WT/web && npm run dev -- -p 310N`)

### A6c. Where WS3 documents live (all inside `notes/ws3-sprints/`)

```
notes/ws3-sprints/
  README.md                         how to run the sprints (for the human)
  sprint-plan.md                    overview, estimates, verification modes
  sprint-0-…md … sprint-5-…md       these paste-ready prompts
  handoff-sprint-N.md               written by each sprint agent at the end
  docs/                             WS3 reference docs produced by the sprints:
    elevenlabs-capabilities.md        Sprint 0: verified ElevenLabs capabilities + recommended mechanisms
    contracts-v0.md                   Sprint 0: data contracts for WS2/WS5/WS6 (updated in Sprint 4)
    voice-interface.md                Sprint 4: how WS5 reuses the voice component and consumes our output
    trust.md                          Sprint 4: off-record semantics and retention facts
```

Put every WS3 note you create in this folder (or `docs/`). Don't add WS3 files elsewhere in `notes/`.

### A7. Standard verification commands

```bash
cd web
npm run typecheck
npx vitest run                         # once Sprint 0 has added vitest
npm run sync-agents -- --agent expert  # pushes prompt/tools to the EXPERT agent only
npm run probe -- expert                # simulated text conversations; run 5x for pass-rate claims
npm run dev -- -p 310N                 # live test at http://localhost:310N (N = sprint number; human gate)
```

`web/.env` (copied into your worktree during A6 setup) must contain `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID_EXPERT`. If they are missing, do every step that does not need them, list what is blocked, and ask the human — never fake a probe result.

Probe results are nondeterministic. A behavior counts as "passing" only if it holds in **≥ 4 of 5 runs** per probe case. Report the actual counts.

### A8. Handoff note template (`notes/ws3-sprints/handoff-sprint-N.md`)

```markdown
# WS3 Sprint N handoff — <title>
Branch: worktree-ws03-sprint-N   Worktree: <path>   Dev port: 310N   Spec: specs/<timestamp>-ws3-sprint-N-<slug>/   Date: <date>
## Delivered (files + one line each)
## Verification evidence (pasted command output: typecheck, vitest summary, probe pass counts)
## Decisions made (and why) — especially anything that deviates from the sprint prompt
## Contract changes (fields added/renamed in web/lib/expert/contracts.ts)
## Known limitations / open issues
## Human gate checklist (exact steps for the human to run live, and what to look for)
## Notes for the next sprint
```
