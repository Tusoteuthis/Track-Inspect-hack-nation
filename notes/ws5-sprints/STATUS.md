# WS5 status and pick-up guide (as of 2026-10-04, end of Sprint 4)

Read this first if you are an agent continuing WS5 (knowledge and newcomer tutor). It says where everything is, what is done, what is blocked and what to do next. Details live in the per-sprint handoffs; this file links to them.

## 1. Where the work is

| Item | Value |
|---|---|
| Latest WS5 branch | `worktree-ws05-sprint-4`. It contains Sprints 1–4, plus `voice` as of WS3 S1 and WS7 S1–S2 |
| Its worktree | `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-4` |
| Dev port | 3504 (`cd web && npm run dev -- -p 3504`) |
| Merged into `voice`? | **Only Sprint 1.** Sprints 2, 3 and 4 are on `worktree-ws05-sprint-4` and arrive with one merge |
| Spec-kit spec | `specs/20261004-093911-ws5-sprint-4-voice-assessment/` (spec, plan, tasks, all done) |
| Older worktrees | `ws05-sprint-1/2/3` and `ws05-knowledge-tutor` (planning) still exist. They are superseded by `ws05-sprint-4`; the human removes them after the merge |

**Why Sprint 4 is not based on `voice`:**
- Sprint 3 had not been merged when Sprint 4 started.
- The human said "solve the issue then go ahead". So `worktree-ws05-sprint-4` was branched from `worktree-ws05-sprint-3`, and `voice` was merged into it inside the worktree.
- The main checkout was never touched.

**Branch rules (A6):**
- Never run git write commands or edit files in the main checkout.
- Only the human merges into `voice`, and does it after the gate.
- For a Sprint 5 or fix-up, either continue on `worktree-ws05-sprint-4` (before it is merged) or branch a new `ws05-sprint-N` worktree from `voice` (after it is merged).

## 2. State by sprint

| Sprint | What it delivered | Gate | Handoff |
|---|---|---|---|
| S1 Knowledge schema | `schema.ts` (ws5.v0), Markdown round-trip, status transitions, eligibility, retrieval, fixtures | passed, merged | `handoff-sprint-1.md` |
| S2 Synthesis & Work Map | `synthesize`, gaps, teach-back, Work Map content, WS3/WS6 adapters | **not run** | `handoff-sprint-2.md` |
| S3 Tutor evaluation | `evaluate()` = input guard → retrieve → LLM judge → output guard → feedback; timeline; WS6 `TutorEvaluator` adapter; anti-cheating tests | **not run; LLM harness blocked (no key)** | `handoff-sprint-3.md` |
| S4 Voice, observation, assessment, trust | tutor ElevenLabs prompt + probes, `observation.ts`, `tutor-context.ts`, `assessment.ts`, `trust.ts`, WS6 assessment adapter, `dev/e2e-ws5.mts` | **not run** | `handoff-sprint-4.md` |

**Verification at the end of S4** (run in `web/`):
- `npm run typecheck`: exit 0.
- `npx vitest run`: 61 files, 771 tests passed.
- `npm run probe -- tutor --runs 5`: 5/5 on all five tutor cases.
- `npx tsx lib/knowledge/dev/e2e-ws5.mts --live-tutor`: exit 0.

Raw outputs: `docs/tutor-probes-sprint-4.txt`, `docs/e2e-ws5-sprint-4.txt`.

## 3. What is blocked, and why

1. **No `ANTHROPIC_API_KEY`** in any `.env` or in the shell.
   - **What needs it:** only the tutor evaluator's judge (`web/lib/knowledge/judge-anthropic.ts`, decision D1). That LLM reads the learner's draft against the expert's quotes and returns `ok` / `intervene` / `uncertain`, a citation and a guiding question.
   - **What runs without it:** guards, retrieval, synthesis, assessment, trust and the voice tutor. The voice tutor runs on ElevenLabs with its own LLM setting.
   - **Consequences:**
     - `npm run eval:ws5` (Sprint 3 harness: 6 drafts × 5 runs, ≥ 4/5 per class) has never run;
     - the e2e uses a **stand-in judge** with scripted outcomes (`dev/scenario.ts`, labelled in the output);
     - "wrong decision caught before save" is shown with real citations and guards but a scripted outcome.
   - **Fix:** put the key in the worktree's `web/.env` (gitignored), run `npm run eval:ws5`, paste the counts into `handoff-sprint-3.md`, then re-run the e2e (the judge becomes LIVE automatically). If counts are < 4/5, tune only `JUDGE_SYSTEM_PROMPT`.
   - **Without Anthropic:** write another `Judge` adapter (interface in `evaluation-types.ts`, about one file), record the change to D1 in `sprint-plan.md`, and run the harness.
2. **WS6 Sprints 3/4 are not merged.** WS6 is on branch `004-ws6-knowledge-confirmation`, at S2.
   - No server commit guard, no revoke route, no assessment route.
   - The e2e mirrors them as labelled stand-ins (`commitStandIn`, `revokeRevision`, `confirmRevision` in `dev/scenario.ts`).
   - Our adapters mirror WS6's documented signatures: `createWs6TutorEvaluator`, `createWs6AssessmentModule`, `checkPinnedKnowledge`.
3. **WS7 `/practice` uses WS7's own fixture evaluator,** not ours. The tutor there receives WS7's `[PRACTICE evaluation …]` lines, which the prompt also understands. We have asked WS7 to send `buildEvaluationContextBlock` instead.

## 4. Environment facts (easy to get wrong)

- **ElevenLabs key.** The working key is `ELEVEN_LABS_KEY` in the repo-root `.env`. The main checkout's `web/.env` `ELEVENLABS_API_KEY` is stale (401). The `ws05-sprint-4` worktree's `web/.env` already has the working key and both agent ids.
- **Agents.**
  - tutor = `agent_6401m424ywywecnrxne0rtp3frwx` (`ELEVENLABS_AGENT_ID_TUTOR`);
  - expert = `agent_3701m420qeqff2ysp5xh34vfkt5a` (WS3's; **never push to it**).
  - Push the tutor only with `npm run sync-agents -- --agent tutor`. The tutor has **0 knowledge docs on purpose**: knowledge reaches it only as per-evaluation context blocks.
- **Probes.** `npm run probe -- tutor --runs 5` runs text simulations. Context blocks are injected as user turns, because simulations cannot carry contextual updates, and simulated transcripts split words ("F IXTURE"). The quote check ignores spacing for that reason.
- **Long commands.** `npx tsx …` scripts read stdin-free. Never start a heredoc `cat >` without input in a background command: it hangs.
- **Ignored output.** `web/.gitignore` has a bare `out` rule, so `web/fixtures/ws5/synthesis/out/` is force-added. E2E output goes to `web/fixtures/ws5/e2e/output/`.

## 5. Map of the code (all in `web/lib/knowledge/` unless noted)

| Concern | Files |
|---|---|
| Schema, Markdown, status | `schema.ts`, `markdown.ts`, `status.ts` |
| What may teach | `eligibility.ts` (`isTeachable`, `selectEligible`), `retrieve.ts` |
| Synthesis, gaps, teach-back, Work Map | `material.ts`, `cues.ts`, `synthesize.ts`, `gaps.ts`, `teach-back.ts`, `workmap.ts` |
| Tutor evaluation | `evaluate.ts`, `case-view.ts`, `judge-input.ts`, `output-guard.ts`, `judge-anthropic.ts`, `evaluation-types.ts`, `timeline.ts` |
| Screen observation | `observation.ts` (`LearnerScreenContext`) |
| What the voice tutor hears | `tutor-context.ts` (`[EVALUATION]`, `[SESSION]`, `[KNOWLEDGE_CHANGED]` blocks) |
| Assessment | `assessment.ts` (`buildAssessment`, `renderAssessmentMarkdown`, `MASTERY_DISCLAIMER`) |
| Trust propagation | `trust.ts` (`checkPinnedKnowledge`, `flagDependents`) |
| Partner adapters | `adapters/ws3-synthesis.ts`, `adapters/ws6-synthesis-module.ts`, `adapters/ws6-tutor-evaluator.ts`, `adapters/ws6-assessment-module.ts` |
| Dev only | `dev/synthesize-fixtures.mts`, `dev/scenario.ts`, `dev/e2e-ws5.mts` |
| Tutor agent | `agents/tutor/system-prompt.md`, `agents/tutor/first-message.md`, `agents/manifest.json` (tutor entry), `agents/probes.json` (`tutor.cases`) |
| Fixtures (all `source: "fixture"`) | `web/fixtures/ws5/` (entries, exchanges, drafts d01–d06, synthesis scenario, e2e) |
| Docs | `notes/ws5-sprints/docs/knowledge-schema-v0.md` §1–11 (semantics of everything above) |

## 6. Next steps, in order

1. **Human gates:** run S4 (checklist in `handoff-sprint-4.md`), S3 (needs the key) and S2 (output review).
2. **Key:** add the Anthropic key (or swap the provider, see §3.1), run `npm run eval:ws5`, re-run the e2e, and update `handoff-sprint-3.md` / `handoff-sprint-4.md` with the counts.
3. **Merge:** the human merges `worktree-ws05-sprint-4` into `voice`. It must be a clean main checkout and a `--no-ff` merge.
4. **Open decisions with partners:**
   - WS6 outcome policy: `ok` allow / `intervene` block / `uncertain` allow only with escalation.
   - WS7: whether `uncertain` permits an escalated save (WS7 currently blocks it).
5. **When WS6 S3/S4 land:**
   - wire our adapters into `web/lib/backend/modules.ts` (WS6 does this);
   - replace the stand-ins in `dev/e2e-ws5.mts` with route calls;
   - re-run the trust tests against WS6's deletion cascade.
6. **When WS7 sends our context blocks:** re-run the live voice gate. Also send `buildKnowledgeChangedBlock` on revocation and record guidance delivery times for the timeline.
7. **Optional:**
   - a second unseen case with reduced help, to report transfer (needs WS4 cases);
   - WS4 `visible_context[]` on real cases.

## 7. Rules that must keep holding (the tests enforce most of them)

- The tutor's success comes from captured expert knowledge only: no case ids, no answer keys, no evaluator notes. `anti-cheating.test.ts` scans all of `lib/knowledge/`, including `dev/`.
- Only confirmed, current, non-revoked, on-record revisions teach. Off-record never appears in any output (`trust.test.ts` walks every path).
- Quotes are verbatim. The tutor may quote only delivered `expert_quote` lines.
- Assessments never claim mastery and always carry `MASTERY_DISCLAIMER`.
- Fixtures and stand-ins are labelled everywhere. Never present a stand-in judgement as live.
