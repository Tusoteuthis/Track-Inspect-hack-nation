# WS5 Knowledge Schema — v0 (pending agreement)

**Status:** this is a v0 proposal from WS5. It is **pending agreement** with WS3, WS6 and WS7.

**Schema version:** `ws5.v0`

**Canonical source:** [`web/lib/knowledge/schema.ts`](../../../web/lib/knowledge/schema.ts) (types and `validateEntry`) and [`markdown.ts`](../../../web/lib/knowledge/markdown.ts) (file format). The public API is in `web/lib/knowledge/index.ts`.

**Sample data:** `web/fixtures/ws5/` holds exchanges, plus `entries/<entry_id>/rev-<n>.json|.md` and `current.json`. Everything there is `source: "fixture"` with placeholder wording.

## 1. What an entry is

A knowledge entry is one revision of one workflow item: a step, decision, guardrail, exception or escalation rule. Its meaning comes from the expert's own words. It always links to:

- **a screen moment:** a pointing event plus the image region;
- **the expert's words:** an exchange plus a verbatim quote.

Revisions are immutable. A correction creates `rev-(n+1)` with `parent_revision_id = rev-n`.

Conventions:
- Field names are snake_case.
- `null` means unknown; it is never guessed.
- `_utc` fields are ISO-8601 timestamps.

### Frontmatter

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `"ws5.v0"` | Format version |
| `entry_id`, `revision_id` | string | Stable identity plus the exact version taught or confirmed. `revision_id` is entry-scoped (`rev-1`, `rev-2`, …) |
| `parent_revision_id` | string \| null | The revision this one corrects |
| `change_reason` | string \| null, optional | Sprint 2. Why this revision exists, e.g. `support changed: added sx-010 (correction cnf-sx-001)`. Written only when present, so older files render unchanged |
| `status` | `draft` \| `confirmed` \| `unresolved` \| `revoked` | See §3 |
| `kind` | `step` \| `decision` \| `guardrail` \| `exception` \| `escalation` | WS3 `StepKind` plus `escalation` |
| `workflow_position` | integer \| null | Teaching order in the Work Map. Not the recording order |
| `source` | `live` \| `fixture` | Provenance |
| `produced_by` | `{ module, version }` | Which module wrote this revision |
| `created_at_utc` | ISO | When the revision was created |
| `revoked_at_utc`, `revoked_reason` | string \| null | Set **only** when revoked, and then both are required |

### Body

Expert words and AI synthesis are **different types**. Every statement is one of:

- `{ type: "expert_quote", exchange_id, quote }`: a verbatim span of one answer line.
- `{ type: "ai_synthesis", text }`: AI wording. It is never presented as the expert's words.

| Field | Type | Meaning |
|---|---|---|
| `workflow_step` | Statement \| null | What the learner must do or decide (usually synthesis in process terms) |
| `observation` | Statement \| null | The visible feature |
| `expert_words` | `{ exchange_id, quote }[]` | The expert's words, verbatim. ≥ 1 required |
| `interpretation` | Statement[] | The meaning the expert gave |
| `reasoning` | Statement[] | Cues and distinctions behind it |
| `exceptions` | `{ trigger: Statement, action: Statement }[]` | When it applies, and what to do then |
| `visual_evidence` | `{ event_id, asset_id \| null, image_ref, highlighted_image_ref, region, session_time_ms \| null, signal_interval \| null }[]` | Screen moments. ≥ 1 required. `region` is WS3's `Region`. Image refs are **relative** to the `.md` file |
| `confirmation` | `{ confirmation_id, revision_id_reviewed, result, expert_response_exchange_id }` \| null | The expert's explicit response about **this** revision |
| `qualifiers` | string[] | Preserved words like "usually" or "only if". Each must appear in a quote |
| `open_questions` | string[] | What is still unknown |

`session_time_ms` (elapsed recording time) and `signal_interval` (a calibrated trace-axis position) are separate and both nullable. Neither is ever derived from the other, and nothing is read off a photographed curve.

## 2. Markdown file (`entries/<entry_id>/rev-<n>.md`)

- **Frontmatter:** one `key: <JSON value>` per line. This is valid YAML, and readers don't need a YAML library.
- **Fixed `##` headings, in this order:** Workflow step/decision · Observation · Expert's words · Expert interpretation · Reasoning · **Synthesis (AI, not expert words)** · Exceptions / guardrails · Visual evidence · Confirmation evidence · Qualifiers · Open questions.
- **Expert's words** are blockquotes: `> "quote"` then `> — exchange \`exc-…\``.
- **Interpretation and Reasoning** sections list only `[expert words · exc-…] "quote"` items. Their `[AI synthesis]` items are rendered under the Synthesis heading and tagged with their section. Mixing the two in one section is a parse error.
- **Visual evidence** shows the highlighted image and a link to the original. The exact region and time data sit in a `<!-- ws5:visual {...} -->` comment.
- **Empty and unknown values:** an empty section is `_none_`, and an unknown value is `_unknown_`.
- **Round trip:** `parseEntryMarkdown(renderEntryMarkdown(e))` deep-equals `e`. This is tested on every fixture and on awkward strings.

Example (fixture `ent-guardrail-c/rev-1.md`, trimmed):

```markdown
---
schema_version: "ws5.v0"
entry_id: "ent-guardrail-c"
revision_id: "rev-1"
parent_revision_id: null
status: "confirmed"
kind: "guardrail"
workflow_position: 3
source: "fixture"
produced_by: {"module":"ws5-fixtures","version":"0.1.0"}
created_at_utc: "2026-10-03T10:03:20.000Z"
revoked_at_utc: null
revoked_reason: null
---

# guardrail `ent-guardrail-c` · rev-1

> **Status:** confirmed · **Kind:** guardrail · **Source:** fixture

## Workflow step/decision

[AI synthesis] FIXTURE guardrail: check the second channel before saving decision A.

## Expert's words

> "never save FIXTURE decision A when FIXTURE condition C is present on the second channel."
> — exchange `exc-003`

## Synthesis (AI, not expert words)

_none_

## Exceptions / guardrails

- **When:** [expert words · exc-003] "FIXTURE condition C is present on the second channel"
  **Then:** [expert words · exc-003] "never save FIXTURE decision A"

## Visual evidence

- Event `evt-002`
  ![highlighted region of evt-002](<../../../../public/fixtures/trace-a-evt-002-highlight.svg>) [original frame](<../../../../public/fixtures/trace-a-full.svg>)
  <!-- ws5:visual {"event_id":"evt-002", …} -->

## Confirmation evidence

- `cnf-002`: **confirmed** for revision `rev-1`, expert response `exc-005`
  <!-- ws5:confirmation {…} -->
```

## 3. Status meanings and transitions

| Status | Meaning | Teaches? |
|---|---|---|
| `draft` | Synthesized from captured exchanges, not yet confirmed | No |
| `confirmed` | The expert explicitly confirmed **this** revision (`confirmation.revision_id_reviewed === revision_id`, `result: "confirmed"`) | Yes, if current, valid and on-record |
| `unresolved` | Conflicting or incomplete, or the expert said they are unsure. Also covers a confirmed revision that was later corrected | No |
| `revoked` | Withdrawn. The content is kept for audit, with `revoked_at_utc` and `revoked_reason` | No, never again |

`nextStatus(current, action)` is a pure function for WS6. Its `action` is `{ type: "confirmation", result }` or `{ type: "revoke" }`.

| current \\ action | confirmed | corrected | unresolved | revoke |
|---|---|---|---|---|
| draft | confirmed | draft + **new revision** | unresolved | revoked |
| unresolved | confirmed | unresolved + **new revision** | unresolved | revoked |
| confirmed | confirmed | **unresolved** + **new revision** | unresolved | revoked |
| revoked | invalid_transition | invalid_transition | invalid_transition | invalid_transition |

A correction never edits the reviewed revision's content (`new_revision_required: true`). The corrected understanding becomes a new draft revision that needs its own confirmation. A corrected confirmed revision stops teaching at once. `nextStatus` does not see revision ids, so WS6 must check that the confirmation's revision id is the revision being updated.

## 4. Invariants (`validateEntry`, returns every violation)

| Code | Rule |
|---|---|
| `invalid_shape` | Types, enums and required fields (all shape problems are reported together) |
| `missing_visual_evidence` | Every entry (all kinds) needs ≥ 1 screen moment. It is flagged, never filled |
| `missing_expert_quote` | Every entry needs ≥ 1 verbatim quote in `expert_words` |
| `quote_not_verbatim` | Every quote, wherever it appears, is an **exact** substring of one `answer_lines[].text` of its own exchange. There is no case or punctuation normalization, and a quote may not span answer lines. `assertQuotesVerbatim(entry, exchanges)` throws with every offender |
| `unknown_exchange`, `unknown_event` | Linked ids must exist (checked when the records are passed in) |
| `confirmed_without_confirmation`, `confirmation_result_mismatch` | `confirmed` needs confirmation evidence with `result: "confirmed"` |
| `confirmation_revision_mismatch` | `confirmation.revision_id_reviewed === revision_id` |
| `revoked_missing_fields`, `non_revoked_has_revoked_fields` | Revocation fields are present exactly when revoked |
| `absolute_image_ref` | Image links are relative paths |
| `qualifier_not_in_quotes` | A preserved qualifier must occur in the expert's quotes |

## 5. Eligibility (`isTeachable`, `selectEligible`)

`isTeachable(candidate, ctx)` returns `{ ok: true }` or `{ ok: false, reason, detail }`.

- `candidate` is `{ record_type, path, entry }`.
- `ctx` is `{ current_revision_by_entry, exchanges, events, allow_fixture }`.

The checks run in this order, and the first failure is returned:

1. `not_knowledge`: `record_type !== "knowledge_entry"`, or the path is not `…/entries/<entry_id>/rev-<n>.(md|json)` matching the entry, or the path is under `assessments/`, `learner/`, `evaluator/`, `.runtime/` or `sessions/`.
2. `invalid`: fails §4, with the linked exchanges and events checked. Unknown links fail closed here.
3. `revoked`
4. `not_confirmed`: the entry is draft or unresolved.
5. `superseded`: this is not the entry's `current.json` revision, or the entry has no current revision.
6. `off_record_evidence`: a linked exchange (quotes and the confirmation response) or event (visual evidence and the exchanges' own events) is `off_record`.
7. `fixture_not_allowed`: the entry, or any linked record, is `source: "fixture"` and `allow_fixture` is false.

`selectEligible(candidates, ctx)` returns `{ pinned, excluded }`:

- `pinned` holds frozen copies of the teachable revisions, sorted by `workflow_position` (unknown last), then `entry_id`.
- `excluded` lists `{ entry_id, revision_id, path, reason, detail }` for the rest.

Re-run it after any change to entries, confirmations, revocations or record state. Never reuse an old pin set.

## 6. Retrieval (`retrieve`)

`retrieve({ knowledge: pinned, query: { decision, reason, visual_context, case_observations }, limit, ctx? })` returns ranked `{ entry_id, revision_id, score, why }[]`.

- **Score:** the share of query terms found in the entry text (observation, step, interpretation, reasoning, exceptions, quotes), plus a kind priority: guardrail/escalation 0.3, exception 0.2, decision 0.1, step 0. Terms are lowercased Unicode words, with stop words dropped.
- **Always included:** eligible guardrails and escalation rules are always returned, and the limit never drops them. Other entries need at least one matching term.
- **Determinism:** ties are broken by `entry_id`.
- **Refusals:** it throws `IneligibleKnowledgeError` for any revision that did not come from `selectEligible`, is not confirmed, or is invalid. With `ctx`, it also refuses anything no longer teachable, such as a revision revoked or superseded since pinning.

## 7. Mapping to partner contracts

### WS6 `KnowledgeRevision` (from `notes/ws6-sprints/sprint-0-foundation-contracts.md`; WS6 Sprint 0 is not merged yet)

| WS6 field | WS5 source |
|---|---|
| `entry_id`, `revision_id`, `parent_revision_id`, `status` | Same names, same values |
| `content_path` | `knowledge/entries/<entry_id>/<revision_id>.md` = `renderEntryMarkdown(entry)` |
| `evidence.event_ids` | `visual_evidence[].event_id` |
| `evidence.exchange_ids` | the exchange ids of `collectQuotes(entry)` plus `confirmation.expert_response_exchange_id` |
| `evidence.asset_ids` | the non-null `visual_evidence[].asset_id` values |
| `produced_by.module`, `.version` | `produced_by.module`, `.version` |
| `produced_by.source` (`live` \| `stub` \| `fixture`) | WS5 `source` (`live` \| `fixture`). `stub` is WS6-only: a stub-produced entry is never confirmed by WS5 logic |
| `created_at_utc` | `created_at_utc` |
| `current.json` | Feeds `ctx.current_revision_by_entry[entry_id]` |

WS6 `Confirmation` maps as `reviewed_revision_id` → `confirmation.revision_id_reviewed`, `result` → `result` and `expert_response_exchange_id` → same. `confirmation_id` is the same, and WS6 keeps `at_utc`.

### WS3 (`web/lib/expert/contracts.ts`, `ws3.v0`)

| WS3 | WS5 |
|---|---|
| `ExpertExchange.answer_lines[].text` | The only source of quotes |
| `ExpertExchange.record_state`, `PointingEvent.record_state` | Drive `off_record_evidence` |
| `PointingEvent.image_ref`, `highlighted_image_ref`, `region`, `session_time_ms`, `signal_interval` | `visual_evidence[]`, with refs rewritten relative to the `.md` file |
| `DraftStep { step_id, text, kind, supporting_event_ids, supporting_exchange_ids }` | One draft entry per step (Sprint 2 synthesis): `text` → `workflow_step` (ai_synthesis), `kind` → `kind`, supporting ids → `visual_evidence` / `expert_words` |
| `DraftRevision.revision_id` (session-scoped) | WS5 revisions are **entry-scoped**. See the open question below |
| `ExpertConfirmation { revision_id, status, expert_response_exchange_id }` | `confirmation { revision_id_reviewed, result, expert_response_exchange_id }`, applied to each entry whose `step_id` is in `step_ids_reviewed` |

## 8. Synthesis (Sprint 2) and swapping out the stubs

`synthesize({ events, exchanges, confirmations, prior, gap_answers?, resolve_image_ref })` is pure and deterministic. It returns:
- `entries`: new draft revisions only;
- `workflow`;
- `gaps`;
- `teach_back`;
- `flagged_for_reconfirmation`.

**Rules**
- **Off-record material** (exchanges, events, and exchanges about off-record events) and the exact words of revoked entries are removed first.
- **Teach-back replies** count only when they are the response of a `corrected` confirmation.
- **Grouping.** There is one entry per (screen moment, role):
  - Role comes from the exchange kind: explain/context/distinction/reasoning → step or decision, `guardrail`, `exception`.
  - A line can carry fixed linguistic cues ("never", "stop", "escalate", "unless", "only if" …), which add a guardrail, escalation or exception role.
  - One exchange can therefore support several entries, and one entry can draw on several exchanges.
- **Expert words** are whole answer lines, so they are verbatim by construction.
- **Process text** is a fixed template tagged `[AI synthesis]`; it carries no domain vocabulary.
- **Qualifiers** ("usually", "only if" …) are kept as written.
- **Revisions.**
  - Unchanged content (FNV-1a hash, ignoring ids, status and timestamps) gives no new revision.
  - Changed support gives `rev-(n+1)` with `parent_revision_id` and `change_reason`.
  - A spoken correction without a gesture is tied to the single entry in `step_ids_reviewed`; otherwise it becomes a `conflict` gap.
- **Workflow order** is logical: steps and decisions (in pointing order), then exceptions, guardrails, escalations. The recording timeline is secondary metadata.
- **Gaps** (`findGaps`) cover only what is not answered: `missing_reason`, `unclear_guardrail`, `conflict`, `unqualified_exception`, `missing_evidence`, `ambiguous_reference`.
  - Priority 1 = guardrail/conflict. Never padded.
  - A gap is closed by a later answer, or by `gap_answers` (`{ exchange_id, gap_id }` from WS3's `begin_question`).
- **Teach-back** (`buildTeachBack`) gives one sentence per entry in workflow order and ends with "Is that right, or what should I change?". `reviewed` lists the exact `entry_id@revision_id` a confirmation binds to.
- **Work Map** (`buildWorkMap`) is per workflow step:
  - verbatim expert words with their question, AI synthesis, guardrails, visuals and confirmation;
  - unresolved links go to `broken_links`, a non-verbatim quote is left out and reported, and a missing revision becomes a step that only reports its broken link;
  - by default only confirmed content is shown, or only `isTeachable` content when an eligibility context is passed; `include_draft` shows everything except revoked; `excluded` says what was left out and why.

**WS3: replace `web/lib/expert/synthesis.ts`**

```ts
import { ws3Synthesis, type Ws3SynthesisState } from "@/lib/knowledge";
export const getGaps = (state: Ws3SynthesisState) => ws3Synthesis.getGaps(state);          // OpenQuestion & { kind, priority }
export const buildDraft = (state: Ws3SynthesisState, parent?: DraftRevision) => ws3Synthesis.buildDraft(state, parent);
```

- Map your session state onto `Ws3SynthesisState` `{ session_id, events, exchanges, confirmations, prior_entries?, gap_answers? }`.
- `step_id` is the WS5 `entry_id`; `escalation` maps to your `guardrail`.
- `buildDraft` returns the parent unchanged when nothing changed.
- Without `prior_entries`, the session's own uncorrected draft is treated as the prior, so a correction still produces rev-2.

**WS6: replace the stub in `web/lib/backend/modules.ts`**

```ts
import { createWs6SynthesisModule, parseEntryMarkdown } from "@/lib/knowledge";
export const synthesis = createWs6SynthesisModule({
  load_content: rev => parseEntryMarkdown(readBody(rev.content_path)), // your store
  resolve_image_ref: (ref, entryId) => /* relative from entries/<entryId>/ to knowledge/images/... */ ref,
});
```

- `id: "ws5-synthesis"`, with a `version`.
- `synthesize({ session, events, exchanges, prior, confirmations?, gap_answers? })` returns `{ revisions, workflow_markdown, gaps, teach_back, teach_back_reviewed, flagged_for_reconfirmation }`:
  - Each revision carries `entry_id`, `revision_no`, the parent mapped to your revision id, `change_reason`, `evidence`, `produced_by.source`, the Markdown body and the parsed content.
  - Dedupe is built in: unchanged input returns no revisions.
- `confirmations` and `gap_answers` are additions to your documented input. Without them, corrections cannot produce `rev-(n+1)`.

## 9. Open questions per partner

**WS3**
1. Your revisions are session-scoped (`DraftRevision.rev-N`) and ours are entry-scoped. Is it fine that confirmation of `DraftRevision rev-N` is recorded per entry, listing the exact entry revision each reviewed step corresponds to? Or should `step_ids_reviewed` carry `entry_id@revision_id`?
2. Quotes may not span two answer lines. Is one `answer_lines[]` item one continuous utterance, or are long answers split mid-sentence?
3. Can a teach-back response confirm some steps and correct others in one exchange? Our model assumes one `result` per entry.
4. We do not let ambiguous-mapping events back an entry by convention, but we don't enforce it yet. Should `mapping_status !== "resolved"` make an entry `invalid`?

**WS6**
1. Please call `selectEligible` (exported from `web/lib/knowledge/index.ts`) instead of your stub, and pass `current.json` values as `current_revision_by_entry`.
2. When a confirmed revision is corrected, please move `current.json` to the new revision immediately. `nextStatus` also drops the old one to `unresolved`.
3. Is `status` stored in the immutable `rev-<n>.md` frontmatter, or alongside it? Status changes after creation (confirm/revoke) conflict with immutability if it is stored in the file.
4. What is the exact shape of `current.json`? We assumed `{ entry_id, revision_id }`.
5. Physical deletion semantics for revoked or off-record material are yours. WS5 only guarantees non-eligibility.

**WS7**
1. Render `[expert words · …]` items and `[AI synthesis]` items with distinct styling. Never restyle synthesis as a quote.
2. `workflow_position` is the teaching order. Should the recording timeline (`session_time_ms`) be a secondary view?
3. Revoked entries: hide them, or show them with the revoked banner in an audit view?

## 10. Tutor evaluation (Sprint 3)

`evaluate({ draft, case_view, knowledge }, judge)` decides whether a newcomer's draft may be saved. It returns `TutorEvaluation`:
- `outcome`: `ok` | `intervene` | `uncertain`;
- `cited[]`: `{ entry_id, revision_id, exchange_ids, quote }`;
- `feedback_text`, `guiding_question`, `uncertainty`, `escalation`;
- `evidence[]`, `guard_notes[]`, `produced_by`.

**Pipeline**
1. **Input guard.**
   - `assertLearnerCaseView` takes only `{ case_id, title, visible_context[], source }`. It rejects evaluator or answer-key keys, evaluator paths and unknown fields.
   - Every knowledge candidate must pass `isTeachable`. Otherwise it throws `IneligibleKnowledgeError`.
2. **Retrieve.** Uses `retrieve()` with limit 8, with the eligibility context re-checked. Guardrails and escalation rules are always included.
3. **Judge.** The judge receives `JudgeInput` `{ draft, visible_case[], knowledge[] }`.
   - Each knowledge item carries its expert quotes verbatim and its AI wording labelled.
   - The judge never sees the case id, case title, paths, statuses or other cases.
4. **Output guard** (`guardVerdict`, pure).
   - A citation must name an entry the judge was shown. Its quote must be at least 3 words, verbatim in that revision's quotes and verbatim in the linked answer line.
   - An `ok` or `intervene` with no valid citation becomes `uncertain`.
   - Quoted spans in the question, explanation, uncertainty or context request must lie inside a valid citation; otherwise they are replaced or removed.
   - An escalation must be a pinned `escalation` entry and applies only to `uncertain`. Its words are cited.
   - An `uncertain` with no escalation always carries a request for missing context. It never carries a rule.
5. **Feedback.** It starts with the guiding question, then the explanation, then each citation with an evidence pointer (event + highlighted image). Cited guardrails are labelled "Guardrail — the expert said".

**Failure.** A judge failure (transport, refusal, truncation, invalid JSON) throws `JudgeError`. WS6 must then store `failed`, which never permits a commit.

**Judge (D1 a).** `createAnthropicJudge()` calls `claude-opus-5-5` through `client.beta.messages.create` with:
- `output_config: { effort: "high", format: { type: "json_schema" } }`;
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).

**Timeline.** `buildTimeline(drafts, evaluations, commits, deliveries?)` returns the ordered `proposed | revised | evaluated | guidance_delivered | committed` entries.
- An `intervene` is marked `caught_before_save` if it comes before the first commit, else `discovered_after_save`.
- Pending and failed evaluations are left out.

**WS6.** `createWs6TutorEvaluator({ load_content, load_records, allow_fixture, judge? })` implements `TutorEvaluator` (`id: "ws5-tutor"`). It maps WS5 `rev-<n>` to WS6 revision ids in `cited`, `escalation` and `evidence`.

## 11. Screen observation, tutor context, assessment and trust (Sprint 4)

### Screen observation (`observation.ts`)

`LearnerScreenContext` is what the evaluator and the tutor consume from the learner's screen:

| Field | Meaning |
|---|---|
| `frame_asset_id` | The frame the observation is on: a screen-share still, or the case's trace frame the learner drew on. `null` = no frame |
| `region` | WS3 `Region` (normalized box + frame pixel size) on that frame, as the learner marked it. `null` = nothing marked |
| `visible_case_id` | The case on screen. Used only to drop stale contexts; never shown to the judge |
| `draft_rev` | The draft revision the observation belongs to. Other revisions are stale |
| `captured_at_utc` | When it was captured (session time, not signal time) |
| `source` | `screen_share` (a still of the learner's shared screen) or `app_state` (the region marked in the app) |

**One context = one observation on one frame.** A region is only meaningful on the frame it was drawn on. WS7 draws the region on the case's trace frame, not on the screen-share still, so `fromPracticeState` returns up to two contexts: `app_state` (region on the trace frame) and `screen_share` (the still, no region).

**Hand-over.**
- **WS7 → WS6.** WS7 sends the draft's region and the screen-share still ids.
- **WS6 storage.** WS6 stores `LearnerDraft.visual_context = [{ asset_id, region }]`, using `toWs6VisualContext` (`frame_asset_id → asset_id`).
- **WS6 → WS5.** `fromWs6VisualContext(draft, case_id)` restores the context. `source` is inferred (region present → `app_state`), and the capture time is the draft's `updated_at_utc`.
- **Choosing the context.** `screenContextFor(contexts, { draft_rev, case_id })` picks the current one. It drops other revisions and cases, and prefers a marked region over a bare still.

**What the evaluator and tutor read.**
- `describeScreenContext` turns a context into position words only, for example "a region in the upper left part of the frame, about 20 percent of its width (frame …, from app state)".
- It includes no case id, no capture time and no values read off the trace.
- `createWs6TutorEvaluator` now passes this text as the judge's `visual_context`. Before Sprint 4 it was `null`.

**Honest scope.**
- Nothing in WS5 looks at pixels.
- The screen-share stills are real observation of the learner's screen (WS7 `getDisplayMedia`, every 5 s and on review). They reach WS5 only as frame references.
- The region the tutor talks about is structured app state.

### Tutor context (`tutor-context.ts`)

Knowledge reaches the ElevenLabs tutor only as silent contextual updates built here, never as a knowledge-base upload: the tutor agent has 0 docs.

- **`buildEvaluationContextBlock`.** One block per evaluation, `contextId: ws5-evaluation-<eid>`. It contains:
  - `[EVALUATION eid=… draft_rev=… outcome=…]`
  - `guiding_question:`
  - numbered `expert_quote N: "…" (entry, revision, kind, exchange; example image event)` lines
  - `escalation:` / `uncertainty:` for `uncertain`
  - `learner_screen:`
  - the teaching rules
  - `[/EVALUATION]`

  The AI explanation is **not** passed: only the guiding question, verbatim citations and the uncertainty text, so the tutor has nothing to repeat except the expert's words. The escalation rule's own words are added when the evaluation did not cite them.
- **Refusals.** The block builder throws `TutorContextError` (nothing is delivered) when:
  - a cited revision is not teachable **now** (revoked, superseded, off-record, unknown);
  - a quote is not verbatim or not in the named exchange;
  - the question or uncertainty quotes uncited words;
  - the escalation is not a teachable `escalation` entry;
  - the screen context belongs to another draft revision.
- **`buildSessionContextBlock`.** Orientation only; it carries no knowledge text.
- **`buildKnowledgeChangedBlock`.** Withdraws entries by id without repeating their words. Send it on `entry.revoked` or a correction.
- **No dynamic variables.** WS7's `TutorPanel` does not pass any, and an unfilled `{{placeholder}}` would break the session start.
- **No client tools.** Review and Save are WS7 buttons, and the save gate stays on the WS6 server.
- **Older format.** The prompt also understands WS7's current `[PRACTICE evaluation …]` line.

### Assessment (`assessment.ts`)

`buildAssessment({ session_id, timeline, evaluations, commits, knowledge: { pinned }, drafts?, earlier?, help_level?, source, created_at_utc })` → `Assessment` (`ws5.assessment.v0`):

**Decisions**
- Draft revisions are split at commits.
- **Outcome classes:**
  - `correct_unassisted`: committed with `ok`, and no intervene/uncertain review in the decision;
  - `correct_after_help`: committed with `ok` after at least one;
  - `unresolved_or_escalated`: no commit, an escalated save, a final review other than `ok`, or an intervention discovered after save.
- **Interventions** are done or stale reviews with outcome `intervene` or `uncertain`. Each records:
  - when it was evaluated;
  - when the guidance was delivered (timeline);
  - `caught_before_save` or `discovered_after_save`;
  - its citations and escalation.
- Failed and pending reviews count as neither help nor judgement.

**Derived lists**
- `needed_help_with` / `practice_next`: entries cited in interventions, plus the escalation rule. The practice suggestion is a fixed template ("another unseen case … with reduced help") plus the expert's verbatim words; it adds no domain content.
- `skills_demonstrated`: entries cited by the accepted review that needed no coaching in that decision.

**Labels.** Labels come from the pinned, eligible revisions only. A cited entry that has been revoked or changed since is listed with `still_taught: false` and without its words.

**Limitations.** Always included:
- `MASTERY_DISCLAIMER` = "One coached correction is not proof of independent mastery.";
- what "correct" means (consistent with the pinned knowledge per the evaluator; no answer key; the expert did not check the case);
- the observed n;
- whether transfer was tested;
- whether the data is fixture/stub.

**Transfer.** Reported separately in `transfer[]`, from `earlier` assessments of other sessions that share an entry the learner needed help with.

**Markdown.** `renderAssessmentMarkdown()` writes `knowledge/assessments/<sid>.md`. Its only mention of mastery is the disclaimer. It is not an entry (no frontmatter), and the assessments path is never eligible.

**WS6.** `createWs6AssessmentModule({ load_content, load_records, allow_fixture })` (`id: "ws5-assessment"`) fills WS6's minimal `Assessment` fields (`initial_decision`, `assistance`, `final_outcome`, `evidence_used`, `practice_next`) and puts the WS5 structure in `content`. This answers open question 5 with "both".

### Trust (`trust.ts`)

- **`checkPinnedKnowledge(pinnedRefs, candidates, ctx)`** returns `current`, or `knowledge_changed` with the reason for each revision (`revoked`, `superseded`, `not_confirmed`, `off_record_evidence`, `missing`, …). WS6 maps `knowledge_changed` to `evaluation_stale` (`knowledge_changed`), re-pins with `selectEligible`, and sends `buildKnowledgeChangedBlock` to the tutor.
- **`flagDependents({ candidates, revoked, deleted_exchange_ids?, deleted_event_ids?, current_revision_by_entry? })`** returns one flag per dependent revision: `evidence_deleted` > `shares_exchange` > `shares_event`.
  - Flags are advisory and ask for the expert's re-confirmation.
  - Deleted evidence already makes a revision ineligible, because its links no longer resolve.
- **Revocation status.** Because WS6 revisions are immutable, WS6 must hand WS5 candidates whose `status` reflects `current.json` (revoked/unresolved) at read time. Eligibility then excludes them.
