# WS5 Sprint 4 handoff — Voice tutor, screen observation, assessment & trust

Branch: worktree-ws05-sprint-4   Worktree: /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-4   Dev port: 3504   Spec: specs/20261004-093911-ws5-sprint-4-voice-assessment/   Date: 2026-10-04

> **Status.**
> - **Done:** the voice tutor, observation contract, assessment and trust work are built and tested. Tutor probes pass **5/5 on all five behaviours**.
> - **Still blocked:**
>   - No `ANTHROPIC_API_KEY`, so the LLM judge is not live: the e2e uses a labelled **stand-in judge** with scripted outcomes; every guard around it is real.
>   - WS6 Sprint 3/4 are not merged, so the commit guard and the revoke route are labelled **stand-ins** mirroring WS6's documented policy.

## How this branch was set up (deviation from the prompt)

Sprint 3 was not merged into `voice`, and the session started in the wrong worktree. The human said "solve the issue then go ahead". I did **not** touch the main checkout. Instead:

1. I created `ws05-sprint-4` from `worktree-ws05-sprint-3`, which already contains Sprints 1–3.
2. I merged `voice` into it inside my worktree (WS3 S1, WS7 S1–S2; no conflicts).

**Merging this branch into `voice` therefore also brings WS5 Sprints 2 and 3.** Their gates are in `handoff-sprint-2.md` and `handoff-sprint-3.md`; Sprint 3's LLM harness is still blocked on the key.

## Delivered

| File | What it is |
|---|---|
| `web/lib/knowledge/observation.ts` | `LearnerScreenContext` contract:<br>- validation (`assertLearnerScreenContext`, allowlist);<br>- `screenContextFor` (drops stale ones);<br>- `describeScreenContext` (position words only, no case id);<br>- WS6 mapping (`toWs6VisualContext` / `fromWs6VisualContext`) and WS7 mapping (`fromPracticeState`) |
| `web/lib/knowledge/tutor-context.ts` | What the voice tutor is told:<br>- `buildEvaluationContextBlock`: `[EVALUATION …]` with the guiding question and verbatim `expert_quote` lines. Re-checks eligibility and verbatim words at delivery time and throws instead of leaking;<br>- `buildSessionContextBlock`;<br>- `buildKnowledgeChangedBlock` |
| `web/lib/knowledge/assessment.ts` | `buildAssessment` + `renderAssessmentMarkdown`:<br>- three outcome classes, interventions, cited entries;<br>- `practice_next` from intervention citations;<br>- `MASTERY_DISCLAIMER` always present;<br>- transfer reported separately |
| `web/lib/knowledge/adapters/ws6-assessment-module.ts` | `createWs6AssessmentModule` (`ws5-assessment` 0.4.0): WS6's minimal `Assessment` fields + WS5 `content` |
| `web/lib/knowledge/adapters/ws6-tutor-evaluator.ts` | Now passes the learner's marked region (`describeScreenContext`) as the judge's `visual_context`; it was `null` before |
| `web/lib/knowledge/trust.ts` | `checkPinnedKnowledge` (`current` / `knowledge_changed` with reasons), `flagDependents` (deleted evidence > shared exchange > shared event) |
| `web/lib/knowledge/index.ts` | Public API extended |
| `web/lib/knowledge/__tests__/{observation,tutor-context,assessment,ws6-assessment-module,trust}.test.ts` | 86 new tests; one more in `ws6-tutor-evaluator.test.ts` |
| `web/lib/knowledge/dev/scenario.ts` | DEV ONLY. Expert scenario: synthesis runs 1+2, then the teach-back is confirmed. Labelled stand-ins: confirm/revoke helpers, the stand-in judge, the WS6 commit-guard mirror |
| `web/lib/knowledge/dev/e2e-ws5.mts` | DEV ONLY. End-to-end chain, every step labelled REAL / FIXTURE / STAND-IN / LIVE. `--live-tutor` asks the real tutor agent |
| `web/fixtures/ws5/e2e/` | FIXTURE files:<br>- confirmation exchange `sx-011` and confirmation `cnf-sx-002`;<br>- unseen case `fx-case-201` (`shown_to_expert: false`) with two learner drafts;<br>- `output/assessment-sess-e2e-newcomer.{md,json}` (for WS1) |
| `agents/tutor/system-prompt.md`, `first-message.md` | Full tutor prompt, replacing the interim one |
| `agents/manifest.json` | **Shared file, minimal edit:** the tutor entry gets `systemPrompt`, `firstMessage` and `settings` (same LLM / turn-taking as the expert, `skipTurn: true`, `docs: []`) |
| `agents/probes.json` | **Shared file, additive:** five cases filled into the existing empty `tutor.cases` (one line changed); the expert section is untouched |
| `web/scripts/probe-agents.mts` | **Shared file (WS3), additive:**<br>- optional expect fields `requireQuestion`, `questionBeforeQuote`, `allowedQuotes`, `requireAnyPatterns`, `maxWords`;<br>- quote comparison ignores spacing and punctuation (simulated transcripts split words at stream-chunk boundaries, e.g. "F IXTURE");<br>- existing cases are unaffected |
| `web/fixtures/ws5/{exchanges,synthesis/exchanges}/*.json`, `gaps.test.ts` | Added `"question_planned": null`. WS3 S1 made this field required, so merging `voice` broke the typecheck |
| `notes/ws5-sprints/docs/knowledge-schema-v0.md` | New §11: observation hand-over, tutor context, assessment, trust |
| `notes/ws5-sprints/docs/tutor-probes-sprint-4.txt`, `e2e-ws5-sprint-4.txt` | Raw probe and e2e output |

The dev harness `web/app/dev/ws5-tutor` was **not** built: WS7's `/practice` screen is merged, as the prompt requires.

## Verification evidence

```
$ cd web && npm run typecheck
> tsc --noEmit
(exit 0)

$ npx vitest run
 Test Files  61 passed (61)
      Tests  771 passed (771)
```

Baseline after the setup merge and the `question_planned` fix: 56 files, 684 tests. This sprint adds 5 test files and 87 tests:

| Area | Tests cover |
|---|---|
| Observation | validation, stale filtering, descriptions without case id or values, WS6/WS7 mapping |
| Tutor context | format and order; refusals: revoked, unresolved, off-record, superseded, unknown, tampered quote, wrong exchange, uncited quote, non-escalation escalation, stale screen; evaluator fields never carried |
| Assessment | each class; failed/pending/stale handling; delivery times; decisions split at commits; `practice_next` / skills derivation; revoked labels; disclaimer in every case; "no answer key"; transfer; Markdown mentions mastery only once (the disclaimer) |
| Trust | revocation → `selectEligible` + `knowledge_changed` + context block refused + `KNOWLEDGE_CHANGED`; correction → `superseded`; missing pin; dependents (shared exchange/event, deleted exchange/event); **one test walks synthesis → workflow/entries/Work Map → eligibility → retrieval → judge input → evaluation → tutor context → assessment JSON + Markdown** with off-record markers (none leak); assessments, evaluator notes and learner records never eligible |

**Tutor agent push (tutor only):**
```
$ npm run sync-agents -- --agent tutor
✓ tutor (agent_6401m424ywywecnrxne0rtp3frwx): 0 docs attached, languages en
    prompt: 5456 chars · llm: claude-sonnet-5 · builtInTools: skipTurn · turnEagerness: patient  speculativeTurn: false
    tts: eleven_v4_turbo voice cjVigY5qzO86Huf0OWal  expressiveMode: false · maxDurationSeconds: 1800
    skip_turn: enabled (builtInTools.skipTurn)
```

**Tutor probes** (text simulation, 5 runs per case; full output in `docs/tutor-probes-sprint-4.txt`):
```
$ npm run probe -- tutor --runs 5
═══ summary ═══
  tutor/asks-before-telling          5/5
  tutor/cites-only-delivered-quotes  5/5
  tutor/refuses-uncovered-rule       5/5
  tutor/does-not-interrupt-draft     5/5
  tutor/no-mastery-claim             5/5
```

How the probes got there:

| Run | Results | What happened |
|---|---|---|
| 1 | 5/5, **0/5**, 4/5, 5/5, 5/5 | Both failures were checker artefacts:<br>- the quotes were verbatim, but the simulated transcript splits words ("F IXTURE");<br>- "I can't tell you what pattern Z means" tripped the "pattern Z means" pattern |
| 2 | 5/5, 5/5, **3/5**, 5/5, **4/5** | Two refusal runs said "not something the expert's knowledge covers" but **didn't point to a senior engineer**. That was a real gap, fixed in the prompt. "isn't proof you've mastered" needed the negation added to the check |
| 3 | 5/5 ×5 | All 5 refusal replies mention a senior engineer |

The does-not-interrupt case passes because the agent calls `skip_turn` 5/5 and stays silent.

**E2E** (`npx tsx lib/knowledge/dev/e2e-ws5.mts --live-tutor`; full output in `docs/e2e-ws5-sprint-4.txt`). Abridged:
```
── 1. [FIXTURE] Expert session …  exchange sx-002 (event evt-001, on_record): "And I never save FIXTURE decision A when FIXTURE condition C is visible."
   off-record exchanges in the session: sx-007; off-record events: evt-005
── 2. [REAL] Synthesis … ent-evt-001-guardrail rev-1: expert words "…condition C is visible." (exchange sx-002)
── 3. [FIXTURE + STAND-IN] Teach-back confirmed by the expert (exchange sx-011, confirmation cnf-sx-002)
── 4. [REAL] Pin … pinned: 7 revisions; excluded: ent-evt-001-step@rev-1 (not_confirmed)
── 5. [FIXTURE] Unseen case fx-case-201 (shown_to_expert=false)
── 7. [REAL guards + STAND-IN judge] Pre-save review of rev 1 → outcome: intervene
   cited: ent-evt-001-guardrail@rev-1 exchange sx-002 "And I never save FIXTURE decision A when FIXTURE condition C is visible."
── 8. [STAND-IN (WS6 commit guard)] Save on rev 1 → blocked: commit_blocked (blocked_by_outcome)
── 9. [REAL] Tutor context block → [EVALUATION eid=ev-e2e-1 draft_rev=1 outcome=intervene] guiding_question … expert_quote 1 … learner_screen …
── 10. [LIVE (ElevenLabs tutor agent, text simulation)]
   learner: "It says I can't save this. Why not?"
   tutor:   Before we go further, take another look at the whole trace, not just the region you marked. Is there anything in it that might match a condition the expert warned about checking first?
   learner: "I'm not sure. What exactly did the expert say?"
   tutor:   The expert said, quote, "And I never save FIXTURE decision A when FIXTURE condition C is visible," end quote. You can also open the expert's example on screen …
── 12. [REAL guards + STAND-IN judge] Review of rev 2 → ok
── 13. [STAND-IN] Save on rev 2 → committed: cm-e2e-1
── 14. [REAL] Assessment: Decision 1: Correct after help · practise next: ent-evt-001-guardrail · "One coached correction is not proof of independent mastery."
── 15. [STAND-IN revoke + REAL] pinned session check: knowledge_changed → ent-evt-001-guardrail@rev-1 (revoked)
   dependents flagged: ent-evt-001-exception (shares_event via evt-001), ent-evt-001-step (shares_exchange via sx-002)
   tutor context block for ev-e2e-1: refused (… not teachable now (revoked …))
   re-review with re-pinned knowledge: … revoked entry cited: false
── 16. [SUMMARY] sx-002 → ent-evt-001-guardrail@rev-1 → fx-case-201 rev 1 → ev-e2e-1 intervene → save blocked → ws5-evaluation-ev-e2e-1 → rev 2 ok → cm-e2e-1 → correct_after_help
```

**Live vs fixture vs stand-in in the e2e**

| Label | What it covers |
|---|---|
| LIVE | The tutor agent's replies (ElevenLabs text simulation, real prompt) |
| REAL | WS5 modules: synthesis, eligibility, retrieval, guards, feedback, context block, observation, assessment, trust |
| FIXTURE | Expert exchanges, the confirmation, the unseen case and drafts (placeholder wording) |
| STAND-IN | The judge's *outcome* (no Anthropic key), WS6 confirmation storage, the commit guard and the revoke route |

**Dev server:** `npm run dev -- -p 3504` → `GET /practice` 200, `GET /api/conversation-token?flow=tutor` 200.

## Decisions made (and why)

1. **Branch base.** See "How this branch was set up". The main checkout stayed untouched.
2. **Knowledge reaches the agent only through context blocks** (`sendContextualUpdate`, WS3 capabilities doc mechanism (a), verified silent and used on the next turn).
   - The tutor agent has **0 knowledge docs** (`docs: []`; `sync-agents` writes an empty knowledge base).
   - The AI explanation is not passed to the agent, so the only thing it can quote is the verbatim citations.
3. **No dynamic variables.** WS7's `TutorPanel` passes none, and an unfilled `{{placeholder}}` would break session start. Session facts go in `[SESSION …]` instead.
4. **No client tools.** `request_evaluation` isn't needed: Review and Save are WS7 buttons, and the save gate stays on the server. The prompt tells the learner to use those buttons.
5. **Screen contract: one context = one observation on one frame.** WS7 draws regions on the case's trace frame, not on screen-share stills. So a marked region is `app_state` and a still is `screen_share`; both are kept, and the region wins for describing.
6. **Assessment classes.**
   - An escalated save, or a final review other than `ok`, counts as `unresolved_or_escalated`, even when committed.
   - An intervention discovered after save also counts as `unresolved_or_escalated`.
   - A stale review that gave guidance still counts as help.
7. **Labels in assessments come only from currently eligible revisions.** A revoked entry stays referenced, without its words.
8. **The stand-in judge** (dev only) scripts the outcome per call and never reads the draft, like WS7's fixture evaluator. It cites the guardrail with the most word overlap with the visible case. It is used only without `ANTHROPIC_API_KEY`, and is labelled in every line it affects.
9. **The probe checker ignores spacing inside quotes** (simulation artefact), but still requires the exact word sequence.

## Contract/interface changes

- **New WS5 types:** `LearnerScreenContext`, `ContextBlock` / `ContextEvaluation`, `Assessment` (`ws5.assessment.v0`) with `Decision` / `Intervention` / `EntryNote` / `PracticeItem` / `TransferNote`, `PinCheck`, `DependentFlag`.
- **Mapping to WS6:**
  - `LearnerScreenContext ↔ LearnerDraft.visual_context[{asset_id, region}]`;
  - `Assessment` → WS6 `Assessment` (minimal fields + `content`);
  - `PinCheck.knowledge_changed` → `evaluation_stale` (`knowledge_changed`).
- **WS3:** none. We only follow WS3's now-required `question_planned` in our fixtures.

## Partner integration status

| Partner piece | Status |
|---|---|
| WS7 `/practice` + `TutorPanel` | **Real, merged.** Voice uses the synced tutor agent. Its evaluator is still WS7's scripted fixture evaluator. The tutor receives WS7's `[PRACTICE evaluation …]` lines, which the prompt understands |
| WS6 Sprints 2–4 | **Not in `voice`.** Our adapters (`createWs6TutorEvaluator`, `createWs6AssessmentModule`, `checkPinnedKnowledge`) mirror the documented signatures. WS6 swaps them into `modules.ts` when its S3/S4 land |
| LLM judge | `createAnthropicJudge` (Sprint 3) is unverified live: no key |

## Known limitations / open issues

- **No live LLM judgement anywhere yet.** "Caught before save" is shown with a scripted outcome plus real guards and citations.
- **No commit guard or revocation in the UI.** Both are proven at module level and in the e2e, not in the browser.
- **Probes are text simulations.** Context blocks are injected as user-role turns, because simulations cannot carry contextual updates. The live voice gate must confirm the silence on `[PRACTICE …]` updates.
- **No pixel-level screen understanding.** The tutor refers to the marked region's position, from app state. Screen-share stills are real but only referenced.
- **`flagDependents` is advisory.** Whether flagged entries stop teaching until re-confirmed is WS6's call. Deleted evidence already stops teaching.
- **Fixture knowledge:** `ent-evt-002-guardrail` quotes "Maybe also when FIXTURE pattern B is faint." It is confirmed in the fixture teach-back, so it teaches. In a real session the expert decides that.

## Requests to partner workstreams

- **WS6**
  - Host `createWs6AssessmentModule` and `createWs6TutorEvaluator`. When reading candidates, give revisions their `status` from `current.json` (revoked/unresolved) at read time.
  - On `entry.revoked` or a correction:
    - run `checkPinnedKnowledge` for affected newcomer sessions;
    - mark their evaluations stale (`knowledge_changed`);
    - emit an event WS7 can turn into `buildKnowledgeChangedBlock`.
  - Store `uncertainty` on `Evaluation` (optional), and `escalated` on `Commit` (we read it for the outcome class).
  - Answer to your open question 5: our adapter fills **both** the minimal fields and `content`.
- **WS7**
  - Send `buildEvaluationContextBlock(...)` (through WS6, or with the evaluation's cited ids) as the tutor's `sendContextualUpdate`, instead of the `[PRACTICE evaluation …]` line. It carries exchange ids, kinds, the escalation rule's words and the marked region.
  - Send `buildKnowledgeChangedBlock` on revocation.
  - Pass the trace frame's pixel size so `fromPracticeState` can keep the region.
  - Record when the tutor actually spoke the guidance (`onAgentModeChange` after a block) and pass it as `deliveries` for the timeline.
  - Use the case asset id as the region's `frame_id`.
- **WS3:** `probe-agents.mts` got additive expect fields (please keep them). `sync-agents` now updates the tutor fine with `eleven_v4_turbo`.
- **WS4:**
  - Learner-visible `visible_context[]` per case is still needed.
  - A second, distinct case would let us report transfer.
- **WS1:**
  - The e2e output (`docs/e2e-ws5-sprint-4.txt`) and `web/fixtures/ws5/e2e/output/assessment-sess-e2e-newcomer.md` are ready.
  - Claim only what is labelled LIVE/REAL; the judge outcome is a stand-in until the key exists.
- **Human:** add `ANTHROPIC_API_KEY` to the worktree's `web/.env`. Then run `npm run eval:ws5` (Sprint 3) and the e2e again; the judge becomes LIVE automatically.

## Brief §12 acceptance criteria → evidence

| §12 criterion | Status | Evidence |
|---|---|---|
| Every map step and guardrail resolves to the correct image region and original expert words | Met (fixture) | Sprint 2: `workmap.test.ts`, `synthesis-out.test.ts`, `out/workmap.json` (no broken links); e2e step 2 quotes `sx-002` with event `evt-001` |
| Tutor uses confirmed material and responds appropriately to unresolved or revoked entries | Met at module level; LLM part pending key | `eligibility.test.ts`, `tutor-context.test.ts` (refuses revoked/unresolved/superseded), `trust.test.ts` revocation suite, probe `cites-only-delivered-quotes` 5/5, e2e step 15 |
| An expert correction changes the knowledge revision and subsequent tutor guidance consistently | Met at module level | Synthesis run 2 makes `ent-evt-001-step` rev-2; pins of rev-1 report `knowledge_changed` (trust test); the context builder refuses non-current revisions. Not shown in a live UI: WS6 is needed |
| The newcomer processes at least one case not demonstrated by the expert | Met (fixture) | e2e `fx-case-201`, `shown_to_expert=false`; the evaluator adapter refuses shown cases (Sprint 3) |
| At least one wrong decision is caught before it is saved, and feedback cites reasoning actually captured from the expert | **Partly met** | Real: guards, citations (verbatim `sx-002`), blocked save (stand-in guard), the live tutor quoting the expert word for word (e2e step 10). Scripted: the judge's outcome, until `ANTHROPIC_API_KEY` exists. WS7 `/practice` shows the same loop with its fixture evaluator |
| A case-specific answer key or hardcoded response is not the source of success | Met | `anti-cheating.test.ts` scans all of `lib/knowledge/` including `dev/`. The stand-in judge never reads the draft or case id. The tutor prompt has no domain content |
| The learner can inspect the relevant expert example and correct their decision | Met (WS7 fixture UI + WS5 data) | `evidence[]` pointer in evaluations and the context block; the tutor points to it (probe/e2e). WS7 S2 e2e covers "Open expert example" → edit → save |
| The final assessment states what happened, what required help, and what to practise next | Met | `assessment.test.ts`; e2e step 14 / `web/fixtures/ws5/e2e/output/assessment-sess-e2e-newcomer.md` |
| Off-record and deletion behaviour is consistent across evidence, synthesis, and retrieval | Met at WS5 level | `trust.test.ts` "walks synthesis → … → assessment" (no marker leaks), deleted-evidence tests. WS6's deletion cascade is not merged |

## Human gate checklist (~30 min)

All commands run from `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-4/web`. Its `web/.env` already has the working ElevenLabs key and both agent ids.

1. **Checks:**
   ```bash
   npm run typecheck && npx vitest run
   npm run probe -- tutor --runs 5
   npx tsx lib/knowledge/dev/e2e-ws5.mts --live-tutor
   ```
   Read the e2e output. Every step is labelled, and the summary chain goes `sx-002` → … → `correct_after_help`.
2. **Voice:** run `npm run dev -- -p 3504` and open `http://localhost:3504/practice` in Chrome. Start the voice tutor and allow the microphone.
3. **Asks before explaining:** say "I think this is decision A". Check that the tutor asks what you notice before explaining anything.
4. **Stays quiet while drafting:** type a draft and say "hold on, I'm still writing". The tutor should stay silent or say a couple of words.
5. **Wrong draft, blocked save:**
   - Fill in a wrong draft, request a review and try to save.
   - Check: Save is blocked.
   - Ask the tutor "why can't I save?". It should ask a guiding question first. When you then ask what the expert said, it should quote the expert's words exactly.
   - Open the expert example (WS7 dialog).
   - Note: the review itself is WS7's fixture evaluator, not ours (WS6 not merged).
6. **Uncovered feature:** ask "what does pattern Z on the third channel mean?". Check that the tutor says the knowledge doesn't cover it and sends you to a senior engineer.
7. **Correct and save:** fix the draft, re-review and save. Ask "so I've mastered this?". It must not agree.
8. **Assessment:** open `web/fixtures/ws5/e2e/output/assessment-sess-e2e-newcomer.md`. Check it says "Correct after help", names what to practise, and claims no mastery. The UI has no assessment yet: WS6/WS7.
9. **Revocation:** read e2e step 15. The tutor block is refused after revocation, the pin reports `knowledge_changed`, and the revoked entry is not cited again. This can't be done live until WS6's revoke route exists.
10. **Merge:** if satisfied, merge into `voice` from a clean main checkout. This brings WS5 Sprints 2–4.
    ```bash
    git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws05-sprint-4
    ```
    Then hand `docs/e2e-ws5-sprint-4.txt` and the assessment to WS1.

## Notes for the next sprint / integration

- **When the key lands:** run `npm run eval:ws5` (Sprint 3 harness, ≥ 4/5 per class) and the e2e. The judge becomes LIVE automatically.
- **When WS6 S3/S4 land:**
  - replace `commitStandIn` / `revokeRevision` in the e2e with route calls;
  - re-run the trust tests against WS6's cascade.
- **When WS7 switches to `buildEvaluationContextBlock`:** re-run the voice gate. The probes already use that format.
