# WS5 Sprint 2 handoff — Synthesis, gaps, teach-back & Work Map content

Branch: worktree-ws05-sprint-2   Worktree: /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-2   Dev port: 3502 (unused; no UI this sprint)   Spec: specs/20261004-012037-ws5-sprint-2-synthesis-workmap/   Date: 2026-10-04

## Delivered

| File | What it is |
|---|---|
| `web/lib/knowledge/synthesis-types.ts` | `SynthesisInput`/`Output`, `Gap`, `TeachBack`, `WorkflowDoc`, `WorkMapContent`/`WorkMapStep`, `SYNTHESIS_MODULE` |
| `web/lib/knowledge/cues.ts` | Fixed linguistic cues: tendency hedges, uncertain hedges, guardrail/escalation/exception cues. No domain words |
| `web/lib/knowledge/material.ts` | On-record filter, revoked-words filter, line → role classification, correction targeting, gap-answer tracking |
| `web/lib/knowledge/synthesize.ts` | `synthesize` (entries, revisions, corrections, flags, workflow), `contentHash`, `renderWorkflowMarkdown` |
| `web/lib/knowledge/gaps.ts` | `findGaps`: six gap kinds, priorities, answered gaps removed, never padded |
| `web/lib/knowledge/teach-back.ts` | `buildTeachBack`: process-level text, verbatim spans, explicit question, `reviewed` revisions |
| `web/lib/knowledge/workmap.ts` | `buildWorkMap`: Work Map content with `broken_links`, `excluded`, `include_draft`, optional eligibility |
| `web/lib/knowledge/adapters/ws3-synthesis.ts` | `ws3Synthesis.getGaps` / `buildDraft` → WS3 `OpenQuestion` / `DraftRevision` |
| `web/lib/knowledge/adapters/ws6-synthesis-module.ts` | `createWs6SynthesisModule` → WS6 `SynthesisModule` (`id: "ws5-synthesis"`, `version: "0.2.0"`) |
| `web/lib/knowledge/adapters/image-ref.ts` | Default relative image link for `knowledge/entries/<id>/rev-<n>.md` |
| `web/lib/knowledge/schema.ts`, `markdown.ts` | Optional `change_reason` field (frontmatter only when present; S1 fixtures unchanged) |
| `web/lib/knowledge/index.ts` | Public API extended with everything above |
| `web/lib/knowledge/*.test.ts`, `adapters/adapters.test.ts` | 51 new tests (synthesize, gaps, teach-back, workmap, adapters, drift, change_reason, exports) |
| `web/fixtures/ws5/synthesis/` | FIXTURE scenario: `exchanges/sx-001..010`, `confirmations/cnf-sx-001` (correction), `load.ts`, `outputs.ts` |
| `web/fixtures/ws5/synthesis/out/` | Committed output for the human gate: `workflow.md`, `entries/*/rev-*.md`, `gaps.md`/`.json`, `teach-back.md`, `flagged-for-reconfirmation.json`, `workmap.json` |
| `web/lib/knowledge/dev/synthesize-fixtures.mts` | Regenerates `out/` (`cd web && npx tsx lib/knowledge/dev/synthesize-fixtures.mts`); `synthesis-out.test.ts` fails on drift and on broken image links |
| `notes/ws5-sprints/docs/knowledge-schema-v0.md` | New §8 "Synthesis (Sprint 2) and swapping out the stubs"; `change_reason` in the frontmatter table |

**What the fixture scenario covers** (placeholder FIXTURE wording on WS3's `evt-001..005`):

| Exchange | Covers |
|---|---|
| `sx-002` | One exchange supporting two entries (a reason, plus a "never" guardrail) |
| `sx-001` + `sx-002` | One entry with several exchanges |
| `sx-003` | "normally" without an exception → gap |
| `sx-004` | An escalation, and a hedged ("Maybe") guardrail → gap |
| `sx-005` | `evt-004` ambiguous reference → gap |
| `sx-006` | Off-record gesture (`evt-005`) |
| `sx-007` | Off-record exchange |
| `sx-008` | Debrief answer ("Unless …") that closes the "usually" gap on `evt-001` |
| `sx-009` | Answer with no screen moment → `missing_evidence` |
| `sx-010` + `cnf-sx-001` | Teach-back correction → `ent-evt-001-step` rev-2, with two dependents flagged |

## Verification evidence

```
$ cd web && npm run typecheck
> track-inspect-web@0.1.0 typecheck
> tsc --noEmit
exit=0

$ npx vitest run
 Test Files  19 passed (19)
      Tests  225 passed (225)
```

- The baseline on this branch before any change was 174 tests; 51 are new.
- There are no LLM or probe runs, because there is no LLM pass (see below).

**Tests mapped to the acceptance criteria**

| Criterion | Test |
|---|---|
| Synthesis on fixtures passes `validateEntry` and is verbatim | `synthesize.test.ts` "produces draft entries…" |
| Many-to-many evidence | "supports many-to-many evidence" |
| Off-record exclusion | "never lets off-record words or moments into any output field": marker strings, `sx-006`, `sx-007` and `evt-005` are absent from the whole JSON output; also checked for gaps and the Work Map |
| Qualifier → gap | "turns a hedge without a stated exception into a gap, not a rule" |
| Unchanged input → no revision | "creates no new revision when the inputs are unchanged" |
| Correction → rev-2 with parent and change_reason, dependents flagged | "a correction revises only the entry it touches and flags dependents" |
| Gaps exclude answered items and are never padded | `gaps.test.ts` "does not report what was already answered", "drops a gap once a later debrief answer covers it", "…through its gap id", "never pads: a fully answered session has no gaps" |
| Teach-back covers every step and guardrail and lists reviewed revisions | `teach-back.test.ts` (all five tests, including "quotes only verbatim spans") |
| Every Work Map step has ≥ 1 visual and ≥ 1 verbatim quote, or a broken link | `workmap.test.ts` "every step has a visual and a verbatim quote, or reports a broken link", plus the broken-link tests |
| Adapters type-check against the documented interfaces | `adapters/adapters.test.ts` (typed assignments to `Ws3SynthesisModule`, `OpenQuestion`, `DraftRevision` and `Ws6SynthesisModule`) |
| Determinism | "is deterministic" |

## Decisions made (and why)

**Session and worktree**
- **Location:** this session was started in `.claude/worktrees/ws05-knowledge-tutor`, so A6 would print STOP. As in Sprint 1, the human approved creating and using `ws05-sprint-2`.
- **Sprint 1 merge:** Sprint 1 was not in `voice` at the start. At the human's request I merged it (`2e0f16e Merge WS5 Sprint 1 …`, `--no-ff`, main checkout clean) and then branched this worktree from `voice`. The `ws05-sprint-1` worktree and branch still exist.

**Step text**
- **Deterministic.** There is no LLM provider key in `web/.env` and no human agreement to an LLM pass, so none was built.
- Step and process text are fixed templates tagged `[AI synthesis]`, with no domain nouns.
- Expert words are **whole answer lines**, so they are verbatim by construction.
- The teach-back drops a trailing full stop inside its quotes; each span stays a verbatim substring, and a test enforces this.

**Grouping and roles**
- **Grouping** is one entry per (screen moment, role), with id `ent-<event_id>-<role>`. An existing entry for the same moment and role is reused, so revisions accumulate on it.
- **Role** comes from the WS3 exchange kind plus fixed linguistic cues ("never", "stop", "escalate", "unless", "only if" …). This is how one exchange supports several entries without guessing meaning.
- `step` becomes `decision` once a reason is attached.
- An exchange that is an answer to a `gap` question:
  - fills in the reason for its moment, or
  - gets the role of its gap kind when WS3 passes `gap_answers`.
- **Linguistic cues are a deliberate, documented heuristic.** They only decide where a verbatim line is filed and which template wraps it, never what it means. The expert still confirms everything in the teach-back.

**Corrections and flags**
- **A correction without a gesture** is tied to the one entry in `step_ids_reviewed`. With zero or several reviewed entries, it becomes a priority-1 `conflict` gap instead of a guess.
- **A correction is additive:** the new line joins the touched entry, and the old lines stay (rev-2 keeps the parent's quotes). Deterministic synthesis cannot tell which earlier sentence a correction replaces. The expert re-hears the rev-2 teach-back and confirms or corrects again.
- **Dependents:** current entries sharing an event or exchange with the corrected entry's prior support go into `flagged_for_reconfirmation`. This is an extension of the prompt's return shape.
- **Lost support:** an entry whose on-record support disappeared is also flagged; it is not deleted.

**Exclusions**
- **Revoked:** the exact words of a revoked entry are filtered out of every new entry. A revoked `entry_id` is never revised again; new words about that moment start a new id.
- **Teach-back replies** that aren't corrections (a "yes") never become knowledge.
- **Entries from other modules** in `prior` (e.g. the S1 fixtures) are left alone. Synthesis only manages entries whose `produced_by.module` is `ws5-synthesis`.

**Timestamps, order and gap kinds**
- **`created_at_utc`** is the latest supporting answer time. There is no clock read, so the output is deterministic.
- **Workflow order** is steps/decisions, then exceptions, then guardrails, then escalations, with pointing order breaking ties. The recording timeline is kept in `workflow.timeline`.
- **`conflict`** is structural only: a correction that can't be located, or one revision both confirmed and marked unresolved. Semantic contradictions between two answers are not guessed.
- **`unclear_guardrail`** fires in three cases:
  - the latest stop-condition line at a moment is hedged ("maybe", "probably" …);
  - a guardrail question has no answer and no later stop condition exists at that moment;
  - the session has no stop or escalation condition at all.

**Work Map defaults**
- **Default shows confirmed entries only**, or only `isTeachable` entries when WS6 passes an eligibility context.
- `include_draft` shows drafts and unresolved entries, but never revoked ones.
- `excluded` lists what was left out and why.

**TDD caveat**
- `workmap.ts` was written test-first.
- For synthesize, gaps and teach-back, the tests were written right after the first implementation pass, not strictly red-first. Every acceptance criterion has a test (table above).

**Spec-kit:** done as a manual pass (spec, plan, tasks). The `/speckit-*` skills were not invoked because the session cwd is a different worktree; this is the same as Sprint 1.

## Contract/interface changes

- **`KnowledgeEntryContent.change_reason?: string | null`** (new, optional): rendered and parsed in the frontmatter only when present.
- **New WS5 types:**
  - `SynthesisInput`, `SynthesisOutput`;
  - `Gap`, `GapKind`, `GapAnswer`;
  - `TeachBack`, `ReviewedRevision`;
  - `WorkflowDoc`, `WorkflowStep`, `ReconfirmationFlag`;
  - `WorkMapContent`, `WorkMapStep`, `WorkMapExpertWords`, `WorkMapAsset`;
  - `Ws3SynthesisState`, `Ws3Gap`, `Ws3SynthesisModule`;
  - `Ws6Session`, `Ws6KnowledgeRevision`, `Ws6DraftKnowledgeOut`, `Ws6SynthesisInput`, `Ws6SynthesisResult`, `Ws6SynthesisModule`.
- **WS3 mapping:**
  - Gaps map to `OpenQuestion`: `open_question_id = gap_id`, `missing_fact = description`, a fixed `why_it_matters` per kind, and `answered_by_exchange_id: null`.
  - Steps map to `DraftStep`: `step_id = entry_id`, `text` = the teach-back sentence, and `escalation` → `guardrail`.
- **WS6 mapping:**
  - WS5 `rev-<n>` ↔ WS6 `revision_no`.
  - The parent and reviewed/flagged revision ids are mapped to WS6's global `revision_id` through `(entry_id, revision_no)`.
  - Status is taken from WS6's record, not from the Markdown.

## Partner integration status

- **WS3:**
  - `contracts.ts` is real (merged).
  - `web/lib/expert/synthesis.ts` and WS3's state type are **not merged** on `voice` or any WS3 branch. The adapter implements the documented `getGaps(state)` / `buildDraft(state, parentRevision?)` against a WS5-side `Ws3SynthesisState`.
  - Swap-in code: schema doc §8.
- **WS6:**
  - `web/lib/backend/modules.ts` does not exist on `voice` or any WS6 branch (`001-ws6-foundation-contracts`, `002-ws6-expert-capture`).
  - The adapter mirrors the documented `SynthesisModule` and the `KnowledgeRevision` zod contract from `001-ws6-foundation-contracts` as local structural types.
  - Swap-in code: schema doc §8.
- **WS7:** `WorkMapContent` is exported from `@/lib/knowledge`; WS6 should serve it from `GET /api/workmap`.

## Known limitations / open issues

- **Corrections are additive:** rev-2 keeps the superseded quote alongside the correction. Only the expert's re-confirmation resolves which wording holds.
- **Whole-line quotes:** a long answer line is quoted whole, and a line mixing a statement with a stop cue appears in both the step and the guardrail entry.
- **Ordering within steps** follows pointing order; nothing else is known without domain knowledge.
- **Gap answers without a `gap_id`:** a `gap`-kind answer on the same moment closes `missing_reason` only. Other gap kinds close when their underlying condition changes, or via `gap_answers`.
- **`workflow_position` in unchanged revisions** keeps the value from when they were written. `WorkflowDoc` is the source of the current order.
- **`open_questions` on synthesized entries is always empty.** Gaps live in `gaps` / `gaps.json`, not inside entries.
- **Image refs:** the Work Map's `original_ref`/`highlighted_ref` are relative to the entry file unless an asset is known. WS6 must turn them into URLs.

## Requests to partner workstreams

- **WS3:**
  - Swap `synthesis.ts` to `ws3Synthesis` (schema doc §8).
  - Put the `gap_id` from `begin_question` on debrief exchanges, or pass `gap_answers`.
  - For corrections, set `step_ids_reviewed` to the single step being corrected when you can, or point the correction exchange at an event.
  - Decide the open question: your `DraftRevision` ids are session-scoped. Confirmations should bind to the teach-back's `reviewed` `entry_id@revision_id` list.
- **WS4:** the scenario must leave **≥ 3 genuine gaps** after the live session. For example: a moment explained without a reason, a "usually" without an exception, and a hedged or missing stop condition. We never pad gaps.
- **WS6:**
  - Swap the stub for `createWs6SynthesisModule` (schema doc §8).
  - Pass `confirmations` and `gap_answers` into `synthesize`.
  - Store `change_reason`.
  - Surface `flagged_for_reconfirmation` (those entries need re-confirmation; consider dropping them from eligibility until re-confirmed).
  - Map `teach_back_reviewed` "rev-<n>" ids of new revisions to your ids after writing them.
  - Serve `buildWorkMap(...)` from `GET /api/workmap`, passing `eligibility` by default and `include_draft` for `?include=draft`.
- **WS7:** render `WorkMapContent`:
  - `expert_words` as quotes with their question;
  - `synthesis` visibly as AI;
  - `broken_links` visibly (never hide them);
  - `excluded` in an audit or empty-state view if useful.

## Human gate checklist (~20 min)

All paths are inside the worktree `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-2`.

1. Regenerate the outputs and run the checks:
   ```bash
   cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-2/web
   npx tsx lib/knowledge/dev/synthesize-fixtures.mts
   npm run typecheck && npx vitest run
   git -C .. status --short   # expect nothing: the committed output matches
   ```
2. Open `web/fixtures/ws5/synthesis/out/workflow.md` in a Markdown viewer (e.g. VS Code preview) and click through to the entries. Check:
   - the steps read as a process (decision → steps → exception → guardrails → escalation);
   - every entry shows a highlighted image and the expert's words as blockquotes with `sx-…` ids;
   - nothing is stated that the expert did not say: everything not in quotes is tagged `[AI synthesis]` and is generic process wording;
   - `ent-evt-001-step/rev-2.md` has `parent_revision_id: "rev-1"` and a `change_reason` naming `sx-010`.
3. Read `out/gaps.md`. Check that each gap is real and not already answered:
   - `evt-001` has no gaps (reason and exception were given);
   - `evt-002` lacks a reason, has "normally" with no exception, and a hedged stop condition;
   - `evt-004` is ambiguous with no reason;
   - `sx-009` has no screen moment.
4. Read `out/teach-back.md` aloud. Check that it sounds like instructions someone else could follow and ends with the question. Run 2 should include the correction.
5. Glance at `out/flagged-for-reconfirmation.json` (the two `evt-001` entries) and `out/workmap.json` (no `broken_links`).
6. Merge into `voice` once the main checkout is clean:
   ```bash
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws05-sprint-2
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-2
   ```
7. Tell the WS3 and WS6 owners that the real synthesis module is available (schema doc §8).

## Notes for the next sprint (Sprint 3: tutor evaluation)

- Teach only from `selectEligible` output. Synthesis drafts never reach the tutor.
- Treat entries in `flagged_for_reconfirmation` as not teachable until re-confirmed, if WS6 does not already enforce this.
- Verbatim citations: an entry's `expert_words` are whole answer lines with `exchange_id`. The Work Map's `WorkMapExpertWords` adds the question.
- The fixture scenario in `web/fixtures/ws5/synthesis/` and `out/` can seed tutor tests. Confirm entries explicitly in the test, never in the fixtures.
