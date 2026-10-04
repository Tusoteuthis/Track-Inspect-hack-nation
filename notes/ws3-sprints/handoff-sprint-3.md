# WS3 Sprint 3 handoff — Coverage, debrief, teach-back, revisioned confirmation & corrections

Branch: worktree-ws03-sprint-3   Worktree: .claude/worktrees/ws03-sprint-3   Dev port: 3103   Spec: specs/20261004-003657-ws3-sprint-3-debrief-confirmation/   Date: 2026-10-04   **Status: ✅ agent work done; awaiting human gate and merge**

> **Merge note:** Sprint 2 is not merged into `voice` yet, because its human gate is pending. This branch is therefore based on `worktree-ws03-sprint-2`, which contains Sprints 0–2 and the current `voice` (the human approved this).
>
> Merge order: `worktree-ws03-sprint-1`, `worktree-ws03-sprint-2`, then `worktree-ws03-sprint-3`. Alternatively, merge only `worktree-ws03-sprint-3`, which contains all of them.
>
> The dev console is at **`/dev`**, not `/`.

## Delivered (files + one line each)

**Pure logic (test-first, vitest)**

| File | What it is |
|---|---|
| `web/lib/expert/coverage.ts` | Coverage grid (on-record topics × 6 dimensions, plus the session row) and monotonic `applyCoverage`. `openQuestionsFromTopics` turns deferred topics into `oq-NNN`. The deterministic `selectGaps` excludes covered cells and dimensions already asked and answered. `debriefAgenda` is the top 5 gaps. Gap descriptions come from templates. |
| `web/lib/expert/draft.ts` | `quotedSpans` / `checkQuotes` implement the verbatim-quote rule. `buildRevision` checks evidence, flags unsupported steps, adds a guardrail step for every unknown/escalate answer, keeps step ids stable and assigns `rev-n`. Also: `fallbackProposal` (a deterministic draft built from verbatim lines), `diffRevisions`, `stepsToTeach`, `addRevision` (frozen, immutable), and `stepVerification`. |
| `web/lib/expert/synthesis.ts` | The `Synthesis` interface (`getGaps`, `buildDraft`) and `defaultSynthesis`. This is the swap point for WS5. |
| `web/lib/expert/debrief.ts` | Reducer steps: `startDebrief`, `beginPhaseQuestion` (agenda-gated debrief, teach-back corrections), `recordCoverage`, `proposeDraft` (rev-1 / rev-n+1 + teach-back exchange), `confirmRevision` (stale-id and explicit-response checks), `endPhase` (→ `incomplete`), and `phaseBlock`. |
| `web/lib/expert/session-util.ts` | Shared reducer helpers moved out of `session.ts`: `closeActive`, `mark`, `updateExchange`, `updateTopic`. |
| `web/lib/expert/session.ts` | New actions: `task_completed`, `coverage_recorded`, `draft_proposed`, `revision_confirmed`. `begin_question` is phase-aware. Session end leads to `incomplete` unless the session is confirmed. Every ok `begin_question` result ends with "Now say the question out loud, word for word." |
| `web/lib/expert/context-update.ts` | `[PHASE debrief]` block (open gaps only), `[TEACH_BACK rev-n]` block (the steps to teach, plus the steps not to state as fact), `PHASE_CONTEXT_ID = "ws3-phase"`, and the `controlDebriefStart` / `controlTeachBack` nudges. |
| `web/lib/expert/knowledge-render.ts` | `revisions/rev-n.md` and `knowledge-draft.md`: per step, the verification status, the event images (highlighted plus full frame, labelled FIXTURE) and the verbatim answers. Then guardrails, open questions, the diff to the parent and the confirmations. |
| `web/lib/expert/store.ts`, `render.ts`, `timing.ts`, `contracts.ts` | `store.ts` adds `revisions/` (refuses to overwrite with different content), `confirmations.json` and `knowledge-draft.md`. `exchanges.md` shows phase, gap, revision and confirmations. New counters: `debrief_questions`, `debrief_gap_questions`, `teach_backs`. `contracts.ts` gets types and validators (see Contract changes). |
| `web/lib/expert/test-driver.ts`, `probe-lines.ts` | Test support: a reducer driver, and the exact system lines and tool results that the probes replay. |
| Tests | `coverage` (13), `draft` (11), `debrief` (13), `debrief-run` (8, the end-to-end fixture session), `store` (+2 immutability), `contracts.snapshot` (+6), `probes` (now also covers phase blocks, replayed tool calls and the propose_draft mock), `timing` (counters) |

**UI wiring**

| File | What it is |
|---|---|
| `web/components/expert/useExpertSession.ts` | Client tools `record_coverage`, `signal_task_complete`, `propose_draft`, `confirm_revision`. `syncPhase` sends the phase block as a contextual update (`ws3-phase`) whenever it changes. `endTask` / `startTeachBack` are the console paths and send one `[CONTROL]` nudge. Releases stop outside the live phase. |
| `web/components/expert/ExpertConsole.tsx` | Phase bar (live / debrief / teach-back / confirmed, or **incomplete**), confirmation status, and the buttons **Expert is done → debrief** and **Start teach-back (fallback draft)**. Coverage grid (event × dimension, ⚠ = unknown/escalate, hover shows exchanges and the AI note). Debrief agenda (done/total). Revisions with diff to the parent and per-step verification. Confirmations. A "debrief questions" counter. Exchange cards show phase, gap and revision. |

**Agent config**

| File | What it is |
|---|---|
| `agents/expert/system-prompt.md` | New "Phases" section: record coverage, debrief, propose_draft, teach-back and confirmation rules. Silence or a change of subject is not an answer. A correction is recorded first. One anti-narration rule. Nothing is spoken before `begin_question`. |
| `agents/expert/tools.json` | `begin_question` (+ `phase`, `gap_id`, kind `correction`), `record_coverage`, `signal_task_complete`, `propose_draft`, `confirm_revision` (all `expectsResponse`, immediate). |
| `web/scripts/probe-agents.mts` | New assertions `requireTools`, `forbidTools`, `allowedGapIds`, `endsWithQuestion`. Replayed **tool turns** in histories, with the correct output offset. Per-agent `toolMocks`. Mocks use the app's wording. New `--case a,b` filter. |
| `agents/probes(.example).json` | 6 new cases: `debrief-agenda-only`, `debrief-unknown-escalate`, `teach-back-shape`, `teach-back-correction`, `teach-back-silence`, `teach-back-subject-change`. The `propose_draft` mock is the app's real rev-2 result. |

**Docs**:
- `notes/ws3-sprints/docs/contracts-v0.md`: Sprint 3 sections.
- The spec-kit artifacts in the spec folder.

## Verification evidence

```
$ npm run typecheck
> tsc --noEmit                                   (exit 0, no errors)

$ npx vitest run
 Test Files  54 passed (54)
      Tests  846 passed (846)

$ npm run sync-agents -- --agent expert          (final)
  ⟳ tool begin_question updated (tool_2401m420qgfvft3r1rebp9d4q1t8)
  ⟳ tool record_coverage updated (tool_7801m42xj6rdftct88cb84pcdkbb)
  ⟳ tool signal_task_complete updated (tool_8201m42xj6z5e46t60428ptxv0sx)
  ⟳ tool propose_draft updated (tool_3701m42xj75ve4eazsf6h5kee4yh)
  ⟳ tool confirm_revision updated (tool_6401m42xj7bre4jrc26xr691k14a)
✓ expert (agent_3701m420qeqff2ysp5xh34vfkt5a): 0 docs attached, languages en
    prompt: 13886 chars · llm claude-sonnet-5 · builtInTools: skipTurn · turnTimeout 15 · eagerness patient

$ npm run probe -- expert --runs 5               (final prompt, commit 8650446)
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
```

**Probe history.** These are real counts from the earlier full runs of 5. Each fix is in its own commit.

| Run | Prompt state | Result | Fix |
|---|---|---|---|
| 1 | first prompt | `teach-back-shape` 2/5 (the agent kept asking debrief gaps and narrated its tool use); `teach-back-correction` 3/5 (it asked a clarifying question before recording `corrected`); `debrief-unknown-escalate` 4/5; `already-described` 4/5 | `bb7e28e` |
| 2 | after `bb7e28e` | `after-interpretation` 3/5 (called `begin_question` and then stayed silent once `record_coverage` was in the turn) | `367ba91` |
| 4 | after adding narration checks to the new cases | `teach-back-shape` 1/5 | `86401c5` |
| 5 | after `86401c5` | `two-events` 2/5 (said "I'll wait for a pause" together with `skip_turn`); `debrief-agenda-only` 3/5 | `90f86e8` |
| 7 | a debrief-block sentence about recording that primed the agent | `debrief-agenda-only` 0/5 | reverted; probes changed to replay the real tool calls (`33a1815`, `7c0b4f9`) |
| two full runs | after `7c0b4f9` | `stale-release` 3/5 both times (spoke an intro before `begin_question`) | `8650446` |

The final run above is 5/5 everywhere, and 0 of its 80 replies narrate tools, the agenda or the system.

**Sample replies (final run)**

- **debrief-agenda-only:**
  - tool call: `begin_question {"event_id":"evt-002","kind":"gap","gap_id":"gap-oq-001","phase":"debrief",…}`
  - spoken: "Can you tell me what you saw and decided about the region you pointed at on SYS2?"
- **debrief-unknown-escalate:**
  - tool call: `record_coverage {"exchange_id":"ex-004","dimensions":[{"dimension":"alternatives","status":"unknown_escalate",…}]}`
  - next agenda gap: `gap-evt-001-reason`. It never re-asked the alternatives gap.
- **teach-back-shape:** "First, scan SYS1 for a narrow spike, which is usually from the wheel set passing a gap. If both channels show that spike at the same moment, stop and call the measurement team. On SYS2, ignore a slow drift in the first ten minutes, since that is just the sensor warming up. Is that right, or would you change anything?"
- **teach-back-correction:**
  - tool call: `confirm_revision {"revision_id":"rev-1","status":"corrected",…}`
  - then `propose_draft`
  - spoken: "To correct that part, you would only stop and call the measurement team when both channels show the spike at the same moment and it also repeats on the next sleeper. Is that right now?"
- **teach-back-silence:** "Is that right, or would you change anything, or do you need a moment to think?" No `confirm_revision`.
- **teach-back-subject-change:** "I don't actually know anything about that, sorry, I'm just here for the traces. Going back to it, is the procedure I described right, or would you change anything?" No `confirm_revision`.

**End-to-end fixture session** (`web/lib/expert/debrief-run.test.ts`; reducer plus file store, with a scripted agent and expert; *not* live evidence):

- **Live phase:** evt-001 explain + guardrail; evt-003 merged as a duplicate; evt-004 clarify + explain; evt-002 arrives late and is never asked. That gives 4 live questions, 1 of them a guardrail.
- **Debrief agenda:** `gap-oq-001` (evt-002, deferred), `gap-evt-004-guardrails`, `gap-evt-001-alternatives`, `gap-evt-004-alternatives`, `gap-evt-004-reason`.
  - **4 debrief exchanges**, all `phase: debrief`. Each is tied to an agenda gap whose cell was not covered before the debrief.
  - One answer is "I don't know, I'd escalate", which became a guardrail step on evt-004.
- **Drafts:** an invented quote (`"is always a wheel flat"`) is rejected. Rev-1 has 6 supported steps.
- **Correction:** `confirm_revision corrected` leads to rev-2, with `parent_revision_id: rev-1`, `change_exchange_ids: [<correction ex>]`, and a `change_reason` that names it.
  - A stale `rev-1` confirm is rejected.
- **Final confirmation:** `confirmed` on rev-2, linked to the exchange "Yes, that's right now."
- **Saved files:** `revisions/rev-1|2.json|md`, `confirmations.json`, and `knowledge-draft.md`.
  - Every step section in `knowledge-draft.md` has a highlighted image link and verbatim `>` quotes.
  - Every quoted span appears in the expert's answer lines.

**Dev-server smoke (port 3103, curl):**
- `GET /dev` and `GET /` returned 200, and `/api/conversation-token?flow=expert` returned a token.
- A `PUT` of a confirmed session snapshot returned 200 and wrote all files plus `revisions/rev-1.*`.
- A second `PUT` with an edited rev-1 returned **500** "revisions are immutable".
- The test session was deleted, the server stopped, and the log shows no errors.

## Decisions made (and why)

1. **Branch base.** See the merge note: the human approved the Sprint 2 base. The A6 location check was skipped because an orchestrator launched me, and the worktree had already been verified.
2. **Spec-kit.** I ran it as specify → plan → tasks → analyze (a manual report with no findings above LOW) → implement. I asked no clarifying questions and recorded the defaults here and in `research.md`.
3. **Draft generation: the `propose_draft` client tool (Option A), not a server LLM.** `web/.env` has no LLM key, and client tools that return results are verified live.
   - The client is the authority. It validates evidence ids, checks quotes, assigns `rev-n` and `s-N`, flags unsupported steps and adds escalation guardrails.
   - A deterministic `fallbackProposal` (verbatim lines with evidence) backs the console button and the tests.
4. **Phase switch.** The phase block reaches the agent two ways, because a contextual update alone does not trigger a turn (capabilities doc Q1/(d)):
   - in the **tool result** (`signal_task_complete` / `propose_draft`);
   - and as a `ws3-phase` contextual update whenever the block changes.

   The console path adds one `[CONTROL]` nudge.
5. **Teach-back exchange opened by the client.** Each new revision opens a `kind: teach_back` exchange. Its `question` is the agent's spoken teach-back, verbatim, and the expert's reply attaches to it.
   - `confirm_revision` takes the newest teach-back-phase exchange for the latest revision that has a spoken teach-back and expert words, and that no earlier confirmation used.
   - So silence, or reusing an old answer after a correction, can never confirm.
6. **Gap selector.**
   - **Exclusions:** covered cells, and dimensions already asked and answered on the same region (explain→decision, reasoning→reason, context→cues, distinction→alternatives, guardrail→guardrails; clarify never counts).
   - **Deferred topics:** become one open-question gap each, not six dimension gaps.
   - **Order:** open questions first, then guardrails / alternatives / missing reasons, with topic rows before the session row; then status, dimension and topic order.
   - **Size:** the agenda is frozen at debrief start and capped at 5.
   - **Why the session row ranks last:** session-row answers have no screen moment, so steps built only on them get flagged unsupported.
7. **Debrief question rules.** A debrief question must name an open agenda gap. Resolved and unknown gaps are refused with "already answered". The event comes from the gap, not from the agent, and the kind is stored as `gap`. Topic states don't change in the debrief, so Sprint 2's live timing and counters stay untouched.
8. **Unknown or escalate.** `record_coverage status=unknown_escalate` stores `covered` with `resolution: unknown_escalate` and also covers the row's guardrails. `buildRevision` guarantees a guardrail step quoting the expert.
9. **Event evidence.** An exchange's own `event_id` (plus merged duplicates) counts as event evidence for a step. This is a recorded link, not an invented one.
10. **Minimum debrief.** `propose_draft` from the agent is refused until min(3, agenda length) debrief answers exist. The console may force it for development.
11. **Step verification.** A step is `confirmed` only if the latest revision has a `confirmed` confirmation and some confirmation in its chain reviewed that step id. Unchanged steps keep their ids, so an earlier review carries over.
12. **Probes replay real tool calls.** History turns can be `{"role":"agent","tool":{name, params, result}}`, and `probes.test.ts` checks that params and results are exactly what the app produces.
    - Without this, text-only histories made the agent "catch up" on `record_coverage` and narrate it.
    - The simulator returns each replayed tool turn as two items; the output offset accounts for that.

## Contract changes (`web/lib/expert/contracts.ts`)

- New types:
  - `SessionPhase` (`live|debrief|teach_back|confirmed|incomplete`) and `PhaseTrigger`;
  - `PhaseChange`, `Gap`, `DebriefItem`, `DebriefItemState`, `CoverageResolution`;
  - tool param types: `RecordCoverageParams`, `ProposeDraftParams`, `ProposedStep`, `ConfirmRevisionParams`, `CoverageStatusParam`.
- `ExchangeKind`: + `teach_back`, `correction`. `DeferredReason`: + `task_complete`.
- `ExpertExchange`: + `gap_id`, `revision_id` (both required, may be null).
- `CoverageItem`: + `resolution`.
- `DraftStep`: + `supported`. `DraftRevision`: + `change_exchange_ids`.
- `BeginQuestionParams`: + `phase`, `gap_id`.
- `SessionSnapshot`: + `phase`, `phase_log`, `coverage`, `open_questions`, `debrief_agenda`, `revisions`, `confirmations`.
- New validators:
  - tool params: `validateRecordCoverageParams`, `validateProposeDraftParams`, `validateConfirmRevisionParams`;
  - records: `validateCoverageItem`, `validateOpenQuestion`, `validateDebriefItem`, `validateDraftRevision`, `validateExpertConfirmation`;
  - snapshot cross-checks for all links (events, exchanges, gaps, revisions, parents, reviewed steps).
- `COVERAGE_DIMENSIONS` is exported.
- Session folder: + `revisions/rev-n.json|md`, `confirmations.json`, `knowledge-draft.md`. `counts` adds the debrief counters.
- Documented in `notes/ws3-sprints/docs/contracts-v0.md`.

## Known limitations / open issues

- **Probes are text simulations.** Voice behaviour is unverified until the human gate. That covers:
  - the long teach-back monologue as one `agent_response` line;
  - the `ws3-phase` contextual update together with the tool-result path;
  - whether the agent calls `signal_task_complete` on "I'm done".
- **Gate-relevant failure mode:** text before a tool call is spoken. Probes caught this narration ("let me record…") until the last prompt fixes, and voice may still show it occasionally.
- **The [PHASE debrief] tool result and the contextual update both stay in context.** On the console path the agent sees both. In probes it sometimes also calls `signal_task_complete`; the app then answers with a harmless error.
- **`record_coverage` adds a tool call after live answers.** All 10 Sprint 1–2 probes stay at 5/5 in the final run. In a voice session it adds about 160 ms of round trip before a follow-up question.
- **Coverage quality depends on the agent's judgment** (`record_coverage`). There is no kind-based fallback: if the agent never records coverage, only the "asked and answered by kind" exclusion stops repeats. Gaps of the session row can never become supported steps (no screen moment).
- **Teach-back text is not checked against the revision.** It is stored verbatim as the teach-back exchange's `question`, and only the steps in the revision are evidence-checked.
- **Fallback draft (console button)** quotes the first answer line per exchange. It is not process-shaped. The normal path is `propose_draft`.
- **No off-record exclusion yet** (Sprint 4). Off-record topics are excluded from gaps only.
- **Not in scope:** `completion.json` and the WS5 interface doc are Sprint 4.
- **Inherited from earlier sprints:** reload the page between sessions; `audio_offset_secs` stays null.
- **The Sprint 1 and 2 worktrees use the same expert agent,** which now has this sprint's prompt and tools. Their gates still work, because the live rules are unchanged and the new tools return errors or are unused there. But the agent may call `record_coverage`, which those branches don't define: the SDK reports an "unknown client tool" error and the agent continues.

## Human gate checklist

Prerequisites: none. The worktree's `web/.env` has the working key and the expert agent id, and the agent is synced.

1. `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-3/web && npm run dev -- -p 3103`
2. Open **http://localhost:3103/dev**, keep "Expert capture", press **Start** and allow the mic.
3. Press **Run fixture scenario** and talk through the Sprint 2 scenario: evt-001 at 0 s, evt-003 at 8 s, evt-002 at 70 s, evt-004 at 140 s. Answer the live questions, and note which aspects you already explained.
4. Say **"I'm done, that's the task."**
   - **Check:** the phase bar switches to *debrief* (the agent called `signal_task_complete`). If it doesn't within a few seconds, press **Expert is done → debrief**.
   - **Check:** the agenda panel lists gaps you have **not** answered: SYS2/evt-002 if it was never discussed, plus guardrails / alternatives / reasons you skipped.
5. Answer at least 3 debrief questions. Answer one of them with **"I don't know, I'd escalate that."**
   - **Check:** every question carries a gap id (exchange cards), and none repeats something you already answered.
   - **Check:** the "I don't know" cell shows ⚠, and the agent moves on without pushing.
6. The agent proposes a draft and delivers the teach-back (phase *teach-back*; *Revisions* shows rev-1).
   - **Check:** it sounds like a procedure ("First…, if… then…, stop and…") and ends with an explicit "is that right?".
   - If the agent never proposes, press **Start teach-back (fallback draft)**. That draft is not process-shaped.
7. **Deliberately correct one point** (for example "No, it's only when both channels show it").
   - **Check:** *Confirmations* shows `rev-1 corrected`, and rev-2 appears with `← rev-1`, a change reason and "changed s-N".
   - **Check:** the agent re-teaches only the corrected part and asks again.
8. Stay silent for a moment, or change the subject. **Check:** nothing gets confirmed. Then say **"Yes, that's right."**
   - **Check:** the phase reads *confirmed*, and the confirmation shows `rev-2 confirmed (conf-…, ex-…)`.
9. Press **Stop**. Open `.claude/worktrees/ws03-sprint-3/knowledge/sessions/<session id>/knowledge-draft.md`.
   - **Check:** every step links to an image and to your verbatim words, and nothing in quotes is something you didn't say.
   - **Check:** the folder has `revisions/rev-1.*`, `revisions/rev-2.*` and `confirmations.json`.
10. Optional: start a new session (reload the page), end it during the teach-back without answering, then press Stop. **Check:** the phase reads *incomplete*.
11. If you are satisfied, merge from the main checkout once it is clean and no other agent is mid-commit:
    - `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-3`. This includes Sprints 0–2.
    - Then `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-3`, and the Sprint 0–2 worktrees when you're done with them.
    - The main checkout's `web/.env` still needs `ELEVENLABS_AGENT_ID_EXPERT=agent_3701m420qeqff2ysp5xh34vfkt5a` and the working key (see Sprint 1's note).

## Notes for the next sprint

- **Off-record (Sprint 4).**
  - Exclusion must also cover `coverage`, `debrief_agenda`, `revisions` (steps citing off-record exchanges) and `knowledge-draft.md`.
  - `selectGaps` already ignores off-record topics.
  - Revisions are immutable, so excluding material after the fact means a new revision (`change_reason`), never an edit.
- **SessionCompletion.** Derive it from the snapshot:
  - `phase` (`confirmed` → `completed`, `incomplete`);
  - `confirmed_revision_id` = latest revision if it has a `confirmed` confirmation;
  - `coverageGrid(state)`;
  - unanswered `open_questions`;
  - counters from `liveCounters`.

  Write it as `completion.json|md` next to `knowledge-draft.md`.
- **WS5 interface.**
  - Synthesis lives behind `web/lib/expert/synthesis.ts` (`getGaps`, `buildDraft`). The client keeps `rev-n` / `s-N` ids and evidence validation.
  - `knowledge-draft.md` is the WS5-facing view.
  - Document the step-verification rule (`stepVerification`).
- **Probe harness.** Replay tool turns for any new multi-step case, and keep params and results generated by the app (`probe-lines.ts`). `--case` runs a subset, but report the full `--runs 5` summary.
