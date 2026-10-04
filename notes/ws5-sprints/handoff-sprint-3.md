# WS5 Sprint 3 handoff — Tutor evaluation & pre-save intervention

Branch: worktree-ws05-sprint-3   Worktree: /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-3   Dev port: 3503 (unused; no UI this sprint)   Spec: specs/20261003-235839-ws5-sprint-3-tutor-evaluation/   Date: 2026-10-04

> **Status: built and tested with a mocked judge. The LLM-backed harness is BLOCKED.** There is no `ANTHROPIC_API_KEY` in `web/.env`, the repo-root `.env` or the environment. The ≥ 4/5 pass counts can't be reported until the key is added. See "Verification evidence".

## Delivered

| File | What it is |
|---|---|
| `web/lib/knowledge/evaluation-types.ts` | `LearnerDraftInput`, `LearnerCaseView`, `EvaluateInput`, `TutorEvaluation`, `Citation`, `Judge`/`JudgeInput`/`JudgeVerdict`, `JudgeError`, `TUTOR_EVALUATOR` (`ws5-tutor` 0.3.0) |
| `web/lib/knowledge/case-view.ts` | Input guard: `assertLearnerCaseView` (allowlist), `assertNoEvaluatorMaterial` (deep scan for answer-key keys and evaluator paths) |
| `web/lib/knowledge/judge-input.ts` | What the judge sees: draft, visible facts and retrieved eligible entries (verbatim quotes, AI wording labelled). No case id or title |
| `web/lib/knowledge/output-guard.ts` | `guardVerdict`: citation/verbatim/downgrade/uncited-quote/escalation rules (pure) |
| `web/lib/knowledge/evaluate.ts` | `evaluate(input, judge)`: input guard → `retrieve` → judge → output guard → `composeFeedback` |
| `web/lib/knowledge/judge-anthropic.ts` | D1 (a): `createAnthropicJudge()`. `claude-opus-5-5`, JSON-schema structured output, effort `high`, `fallbacks: "default"`. `parseVerdict` validates the output |
| `web/lib/knowledge/timeline.ts` | `buildTimeline(drafts, evaluations, commits, deliveries?)` with `caught_before_save` / `discovered_after_save` |
| `web/lib/knowledge/adapters/ws6-tutor-evaluator.ts` | `createWs6TutorEvaluator` implements WS6's documented `TutorEvaluator` and maps to WS6 revision ids |
| `web/lib/knowledge/index.ts` | Public API extended |
| `web/lib/knowledge/__tests__/*.test.ts` | case-view, output-guard, evaluate, anti-cheating, timeline, judge-anthropic, ws6-tutor-evaluator (+ `helpers.ts`) |
| `web/fixtures/ws5/drafts/d01…d06*.json`, `load.ts` | Labelled FIXTURE drafts (six classes, below) |
| `web/fixtures/ws5/drafts/run-eval.mts` | LLM harness: `npm run eval:ws5 [-- --runs N] [-- --draft file.json]`. Writes `results/<ts>.json` and `results/latest.md` |
| `web/fixtures/ws5/synthesis/out/**` | **Sprint 2 fix.** The committed output was never in git because `web/.gitignore`'s `out` rule matched it. I regenerated it (byte-identical to the Sprint 2 worktree) and force-added it. Without this, `synthesis-out.test.ts` fails everywhere except the Sprint 2 worktree |
| `notes/ws5-sprints/docs/knowledge-schema-v0.md` | New §10 "Tutor evaluation (Sprint 3)" |
| `notes/ws5-sprints/sprint-plan.md` | D1 recorded |
| `web/package.json` (+ lock) | **Shared-file edit:** `@anthropic-ai/sdk ^0.131.0` (D1 needs it) and the `eval:ws5` script |

**Fixture draft classes** (against the Sprint 1 fixture knowledge; FIXTURE wording only):

| Draft | Class | Label |
|---|---|---|
| `d01-consistent` | follows the confirmed decision (cues B and D seen, second channel checked) | `ok`, cites `ent-decision-a` |
| `d02-guardrail-violation` | decision A with condition C on the second channel | `intervene`, cites `ent-guardrail-c` |
| `d03-uncovered` | pattern Z on a third channel; the expert never covered it | `uncertain` + escalation or context request |
| `d04-relies-on-revoked` | leans on the revoked "I choose FIXTURE decision A" | `intervene` via `ent-decision-a`; never cites `ent-revoked-a` |
| `d05-relies-on-unresolved` | leans on the unresolved region-B entry | `uncertain`; never cites `ent-unresolved-b` |
| `d06-right-decision-bad-reason` | decision A right, reason skips the expert's conditions | `intervene` (policy below) |

## Verification evidence

```
$ cd web && npm run typecheck
> tsc --noEmit
(exit 0, no output)

$ npx vitest run
 Test Files  50 passed (50)
      Tests  600 passed (600)
```

- Baseline: after merging Sprint 2 into this branch and fixing its missing output, the suite was 43 files / 505 tests. That leaves 7 new test files and 95 new tests. The new tests cover:
  - **Input guard:** ineligible knowledge (all five ineligible fixture entries, one at a time, plus the whole unfiltered set) throws `IneligibleKnowledgeError` before the judge is called; evaluator fields (nine key names, nested keys, evaluator paths) and unknown fields throw.
  - **Output guard:**
    - an `intervene` (and an `ok`) without a valid citation is downgraded;
    - non-verbatim quotes are rejected (case, punctuation, paraphrase, wrong entry, tampered answer line);
    - an uncited quote in the explanation or question is replaced;
    - an escalation that isn't a pinned escalation rule is dropped;
    - an `uncertain` always carries an escalation or a context request.
  - **All six fixture classes** with a mocked judge, plus judges that cite a revoked entry or invent a rule.
  - **Anti-cheating:**
    - a source grep of `web/lib/knowledge/` (non-test files) for WS4-style case-id literals, case-id comparisons/switches/lookups, `EVALUATOR_DIR`, evaluator paths, the draft-fixture path, answer-key fields and every fixture case id. I checked that it fails on planted violations, then removed them;
    - renaming the case id and title gives identical judge input and identical results for every draft;
    - removing `ent-guardrail-c` changes the outcome away from `intervene` with that citation, even when the judge insists on citing it.
  - **Timeline:** caught before save, discovered after save, explicit vs implied guidance delivery, pending/failed left out, purity.
  - **WS6 adapter:** a compile-time check against the documented signature, id mapping, refusals.
- **LLM-backed harness: BLOCKED (no key).** The real output:
  ```
  $ npm run eval:ws5 -- --runs 1
  BLOCKED: no ANTHROPIC_API_KEY in web/.env or the environment. Nothing was run.
  ```
  - **Plumbing check.** I also ran it once with a deliberately invalid key. All six drafts reached the API, got `401 authentication_error` and were reported as `evaluation failed` (`0/1`, outcome `ERROR`). That results folder was deleted. Nothing counted as a pass, and no LLM result is claimed here.
  - **To finish:** add the key and run `npm run eval:ws5`. Each class needs ≥ 4/5. Paste the summary lines into this section.

## Decisions made (and why), including deviations from the prompt

- **D1 = (a), decided by the human.**
  - **Model and request:** `claude-opus-5-5` (the claude-api skill's current default). Effort is set to `high` explicitly; Opus 5.5 defaults to `medium`, and this is the save gate. Thinking is left at its default (adaptive).
  - **Fallback:** `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) is on, so a safety-classifier decline is re-run on Anthropic's recommended fallback model instead of failing the evaluation.
  - **Structured output:** `output_config.format` json_schema with a plain object schema, no zod (zod isn't a `web/` dependency on `voice`; WS6 is adding it).
  - **No trust in the output:** the response is still validated by `parseVerdict`.
- **The judge's failure is not an outcome.** Transport errors, refusals, truncation and bad JSON throw `JudgeError`, and the WS6 adapter lets the error propagate (WS6 then stores `failed`).
  - We never map a failure to `uncertain`, because `uncertain` permits an escalated save under the current policy.
- **`ok` also needs a valid citation**, a stricter rule than the prompt sets (it only required this of `intervene`). An approval that rests on no confirmed words could let a draft through on the model's own knowledge, so it is downgraded to `uncertain`.
- **Quotes need ≥ 3 words**, and two checks apply: the span must be verbatim in the revision's quotes, and verbatim in the linked exchange's answer line (`verbatimExchangeIds`).
  - This is the per-citation form of `assertQuotesVerbatim`.
  - A sub-span of the expert's words is allowed. Changes in case, punctuation or wording are not.
- **Uncited quotes are replaced, not just flagged.**
  - The explanation becomes a neutral line ("Here is what the expert said that applies to this draft.") and the question becomes a generic look-again question. The expert's quotes are still shown.
  - A final check on the composed `feedback_text` throws if any quoted span is not a citation.
- **The judge sees less than "the case view".** It gets `visible_context` only, not the case id or title (WS4: names can give away answers). The anti-cheating rename test proves the case id and title have no effect.
- **The draft's `visual_context` is text.**
  - WS6's `LearnerDraft.visual_context` is `{asset_id, region}[]`; coordinates mean nothing to a text judge, so the adapter passes `null`.
  - A text description of the marked region is a request to WS7 (below). Screen frames are not used in Sprint 3; that's Sprint 4 with WS7.
- **`case_view` is an allowlist.** Unknown fields throw, so a new WS4 or WS6 field can't silently reach the judge. Adding a field means a WS5 change.
- **Labels live outside `lib/knowledge/`** (`fixtures/ws5/drafts/`). The grep test fails if any runtime module references them.
  - The answer-key names appear in exactly one runtime place: the rejection list in `case-view.ts`, between `ws5:forbidden-fields` markers. The grep strips that block.
- **Spec-kit was a manual pass** (spec, plan, tasks), the same as Sprints 1 and 2. The session's working directory was a different worktree, so the `/speckit-*` scripts would have written to the wrong place.
- **Prerequisite handling: Sprint 2 is merged into this branch, not into `voice`.**
  - **What happened:** at the start, Sprint 2 was not in `voice` and this session was in `ws05-knowledge-tutor`, not the Sprint 3 worktree. At the human's request ("can you solve these issues") I created `ws05-sprint-3` from `voice` (70a85ac) with `git worktree add` and merged `worktree-ws05-sprint-2` into it (`78705c5`, `--no-ff`, clean).
  - **What I didn't touch:** the main checkout and `voice`. **The Sprint 2 human gate is therefore still open.** Merging this branch into `voice` brings Sprint 2 with it.

### Outcome policy (WS6 `outcome-policy.json`): position

**Confirmed:** `ok → allow`, `intervene → block`, `uncertain → allow_with_escalation`. These conditions come with it:

1. A `failed` evaluation never permits a commit. WS6 already states this, and WS5 relies on it: we throw instead of returning `uncertain` on judge failure.
2. `uncertain` means one of two things:
   - a confirmed escalation rule applies (`escalation` set);
   - or the knowledge does not cover the case (a missing-context request).

   In both cases the commit should record `escalated: true`, and WS7 should show "Saved with escalation". If WS6 wants to distinguish them, `escalation !== null` tells them apart. We do not ask for a separate outcome.
3. **"Correct decision, bad reason" → `intervene` (block).** The generic task is decision + reason. A reason that skips the conditions the expert confirmed isn't a sound decision yet, even if the decision happens to be right. The feedback says the decision may stand but the reason must match the expert's conditions (`d06`). If the WS6 or WS1 owners prefer `allow` here, that is a policy change on their side. The outcome stays `intervene`.

## Contract/interface changes

- New WS5 types (above). `TutorEvaluation` maps to WS6 `Evaluation`:

  | WS5 | WS6 |
  |---|---|
  | `outcome` | `outcome` |
  | `cited[]` | `cited[]` (same field names; `quote` always present) |
  | `feedback_text` | `feedback_text` |
  | `guiding_question` | `guiding_question` |
  | `escalation` | `escalation` (`KnowledgeRef`) |
  | `uncertainty` | the `TutorEvaluator` return value's optional `uncertainty` |

  - **Extensions** that WS6's `Evaluation` doesn't have yet: `evidence[]` (`entry_id`, `revision_id`, `event_id`, `highlighted_image_ref`, `image_ref`), `guard_notes[]`.
- `Ws6LearnerCase.visible_context?: string[]` is a WS5-side extension of WS6's documented `LearnerCase` (request below).
- The Sprint 1 and 2 APIs are unchanged.

## Partner integration status

- **WS6 `TutorEvaluator`:** WS6 Sprint 3 is not merged anywhere: no `web/lib/backend/modules.ts` exists on any branch. The adapter matches the documented interface (compile-time check in `ws6-tutor-evaluator.test.ts`) and the `ws6.v0` `LearnerDraft`/`KnowledgeRevision` shapes from `worktree-ws06-backend`. To swap it in:
  ```ts
  import { createWs6TutorEvaluator, parseEntryMarkdown } from "@/lib/knowledge";
  export const tutorEvaluator = createWs6TutorEvaluator({
    load_content: rev => parseEntryMarkdown(readBody(rev.content_path)),
    load_records: async () => ({ exchanges, events, current_revision_no_by_entry }), // re-read per evaluation
    allow_fixture: session.allow_fixture_knowledge,
  }); // judge defaults to createAnthropicJudge(); needs ANTHROPIC_API_KEY on the server
  ```
- **WS7:**
  - `outcomeToReviewState` already fails closed (only `ok` → review_complete).
  - `feedback_text`, `guiding_question` and `cited[].quote` are what WS7 renders.
  - `evidence[]` answers WS7's request for an evidence pointer per citation (resolve the image through the asset/Work Map).
- **WS4:** no merged case fixtures. All drafts are WS5 FIXTURE drafts.

## Known limitations / open issues

- **No LLM pass counts yet** (missing key). The prompt in `judge-anthropic.ts` is untested against the real model, so the ≥ 4/5 bar may need prompt iteration once the key exists.
- **Retrieval is lexical** (Sprint 1). With real, larger knowledge, `RETRIEVAL_LIMIT = 8` plus always-included guardrails may need tuning. On this fixture set the judge sees every eligible entry.
- **Guard phrasing has no domain content.** The fallback guiding question and missing-context text are generic English, by design.
- **Uncertain + escalation text is AI wording.** The `uncertainty` default for an escalation ("The expert gave a confirmed rule for cases like this: escalate.") is AI wording. The rule itself is delivered as the expert's quote.
- **`guidance_delivered` timing is assumed.** Without explicit deliveries, it is assumed to happen when the evaluation finishes (text UI). Voice delivery times arrive in Sprint 4.

## Requests to partner workstreams

- **WS6:**
  - Swap in `createWs6TutorEvaluator` (above).
  - Store `guard_notes` and `evidence` on the `Evaluation` (or in a sidecar) for audit and for WS7.
  - Treat a thrown evaluator as `failed`.
  - Pass `current_revision_no_by_entry` from `current.json` (re-read per evaluation).
  - Confirm the outcome policy above and remove "pending WS5 agreement" if you agree. **We did not edit `outcome-policy.json`.**
- **WS4 → WS6:** add `visible_context: string[]` (the learner-visible facts) to the learner `case.json` / `LearnerCase`. Without it the judge sees only the draft. Evaluator notes stay in `EVALUATOR_DIR`. The case view is an allowlist, and evaluator keys or paths make the evaluation throw.
- **WS7:**
  - Show "Saved with escalation" for `uncertain`. Escalation is set when a confirmed rule applies; otherwise it's a context request.
  - If you can, send a short text description of the marked region alongside `visual_context`.
  - Use `evidence[]` to open the expert example.
- **Shared:** `web/.gitignore` has a bare `out` rule (Next's export dir), which also matches `web/fixtures/ws5/synthesis/out/`. We worked around it with `git add -f`. Whoever owns `.gitignore` could change the rule to `/out`.

## Human gate checklist (~25 min)

All commands run in `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-3/web`.

1. Add the key: put `ANTHROPIC_API_KEY=…` in this worktree's `web/.env`. It is gitignored; never commit it.
2. Run the checks and the harness:
   ```bash
   npm run typecheck && npx vitest run
   npm run eval:ws5            # 6 drafts × 5 runs; each class must be ≥ 4/5
   ```
   Paste the summary lines into "Verification evidence" above, or ask the agent to.
3. Open `fixtures/ws5/drafts/results/latest.md` and read the two `intervene` outputs (`d02`, `d06`, or `d04`). Check:
   - it **starts with a guiding question**;
   - it **cites the expert's exact words** (compare them with `fixtures/ws5/exchanges/exc-003.json` / `exc-009.json`);
   - it **does not reveal anything the knowledge doesn't contain**;
   - "Guard notes" is empty, or explains what was removed.
4. **Your own wrong draft:** copy `fixtures/ws5/drafts/d02-guardrail-violation.json` to `/tmp/my-draft.json`, change the wording (keep condition C visible), then run `npm run eval:ws5 -- --draft /tmp/my-draft.json`. Check that it is caught and that the explanation uses the expert's reasoning.
5. **Something never covered:** write a draft about a feature the fixtures never mention (e.g. a different channel). Delete `label` or set `"outcome": "uncertain"`. Check that you get `uncertain` with an escalation or a context request, and no invented rule.
6. Confirm the outcome policy with the WS6 owner (section above).
7. If you're satisfied, merge into `voice` (the main checkout must be clean). **This also brings Sprint 2**, whose own gate is in `handoff-sprint-2.md`:
   ```bash
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws05-sprint-3
   ```

## Notes for the next sprint (Sprint 4)

- The voice tutor should speak `feedback_text` in its natural order: question first, then the quotes. It may quote only `cited[].quote`.
- `buildTimeline(..., deliveries)` takes the moments the voice actually spoke the guidance. Sprint 4's assessment should use `intervention: "caught_before_save"` and must not claim mastery from a single coached correction.
- If the judge prompt needs tuning after the first harness run, change `JUDGE_SYSTEM_PROMPT` only. The guards don't change.

## Addendum — tutor ElevenLabs agent created (2026-10-04, at the human's request)

- **New agent:** `Track Inspect – Tutor` = `agent_6401m424ywywecnrxne0rtp3frwx`. Before this, no tutor agent existed; the only agent was the expert, `agent_3701m420qeqff2ysp5xh34vfkt5a`.
- **Settings:** the same voice (`cjVigY5qzO86Huf0OWal`, `eleven_v4_turbo`), LLM (`claude-sonnet-5`) and platform settings as the expert. The prompt and first message are the **interim** ones in `agents/tutor/`; the full tutor prompt and probes are Sprint 4. The expert's `begin_question` tool and knowledge docs were not copied. The only tool is the built-in `skip_turn`.
- **How it was created:** with a one-off REST call. `npm run sync-agents -- --create-missing` could not be used, because the installed `@elevenlabs/elevenlabs-js` rejects the expert's TTS model `eleven_v4_turbo` in client-side validation. **WS3:** `sync-agents` will hit the same error when it updates an agent with that model.
- **Where the ID is set:** `ELEVENLABS_AGENT_ID_TUTOR` in this worktree's `web/.env` and in the main checkout's `web/.env` (gitignored).
- **Stale key:** `ELEVENLABS_API_KEY` in the main `web/.env` returns 401. The working key is `ELEVEN_LABS_KEY` in the repo-root `.env`. The main `web/.env` also has an empty `ELEVENLABS_AGENT_ID_EXPERT`.
- **Manifest:** `agents/manifest.json`'s tutor entry still has no `systemPrompt` or `firstMessage` paths. Sprint 4 should add them (`tutor/system-prompt.md`, `tutor/first-message.md`) before running `sync-agents --agent tutor`.
