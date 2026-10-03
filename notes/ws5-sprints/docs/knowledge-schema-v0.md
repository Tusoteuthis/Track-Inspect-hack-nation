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

## 8. Open questions per partner

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
