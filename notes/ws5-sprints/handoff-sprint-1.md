# WS5 Sprint 1 handoff — Knowledge schema, eligibility & retrieval

Branch: worktree-ws05-sprint-1   Worktree: /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-1   Dev port: 3501 (unused)   Spec: specs/20261004-004251-ws5-sprint-1-knowledge-schema/   Date: 2026-10-04

## Delivered

| File | What it is |
|---|---|
| `web/lib/knowledge/schema.ts` | `ws5.v0` types; `validateEntry` (returns every violation); `assertQuotesVerbatim` / `findNonVerbatimQuotes`; `collectQuotes` |
| `web/lib/knowledge/markdown.ts` | `renderEntryMarkdown` / `parseEntryMarkdown`: JSON-valued frontmatter, fixed headings, blockquoted expert words, a separate "Synthesis (AI, not expert words)" section, relative image links; lossless |
| `web/lib/knowledge/status.ts` | `nextStatus(current, action)`: pure transition table for WS6 |
| `web/lib/knowledge/eligibility.ts` | `isTeachable` (7 reasons, fixed order); `selectEligible` → `{ pinned (frozen copies), excluded }` |
| `web/lib/knowledge/retrieve.ts` | `retrieve`: lexical overlap + kind priority, guardrails/escalation always included, throws `IneligibleKnowledgeError` |
| `web/lib/knowledge/index.ts` | Public API |
| `web/lib/knowledge/*.test.ts` | 112 new tests (schema, markdown, status, eligibility, retrieve, index) |
| `web/fixtures/ws5/exchanges/exc-001..011.json` | Placeholder FIXTURE exchanges on WS3's `evt-001/002/003/005` (`exc-008` is off-record) |
| `web/fixtures/ws5/entries/<id>/rev-<n>.json` + `.md` + `current.json` | 9 fixture entries / 10 revisions; the `.md` files are rendered, and a test fails if they drift from the JSON |
| `web/fixtures/ws5/load.ts`, `render-fixtures.mts` | Fixture loader; regenerate the `.md` files with `cd web && npx tsx fixtures/ws5/render-fixtures.mts` |
| `notes/ws5-sprints/docs/knowledge-schema-v0.md` | Partner schema doc: fields, example, statuses, invariants, eligibility, retrieval, WS6/WS3 mapping, open questions |
| `specs/20261004-004251-ws5-sprint-1-knowledge-schema/` | spec, plan, tasks |

Fixture coverage (all `source: "fixture"`, `fixture-session-001`):

| Entry | Covers |
|---|---|
| `ent-step-a` | Confirmed step |
| `ent-guardrail-c` | Confirmed guardrail |
| `ent-escalate-unclear` | Confirmed escalation |
| `ent-draft-start` | Draft |
| `ent-unresolved-b` | Unresolved |
| `ent-revoked-a` | Revoked guardrail |
| `ent-decision-a` | rev-1 superseded by confirmed rev-2 |
| `ent-offrecord-e` | Off-record exchange and event |
| `ent-invalid-quote` | Quote not in its exchange |

## Verification evidence

```
$ cd web && npm run typecheck
> track-inspect-web@0.1.0 typecheck
> tsc --noEmit
(no errors)

$ npx vitest run
 Test Files  8 passed (8)
      Tests  131 passed (131)
```

The 131 tests are 112 new WS5 tests plus WS3's 19, which stay green.

- `selectEligible(all fixtures, allow_fixture: true)` pins exactly `ent-step-a@rev-1`, `ent-decision-a@rev-2`, `ent-guardrail-c@rev-1` and `ent-escalate-unclear@rev-1`. With `allow_fixture: false` it pins nothing.
- There are no LLM or probe runs this sprint.

## Decisions made (and why)

- **Worktree:** this session was started in `.claude/worktrees/ws05-knowledge-tutor`, so the A6 check would have printed STOP. The human confirmed I should use the existing `ws05-sprint-1` worktree; all work and commits happened there.
- **Frontmatter is `key: <JSON>` per line.** It is valid YAML, needs no new dependency (Principle VIII) and round-trips without loss.
- **`workflow_step` and `observation` are `Statement | null`**, not plain strings. Every piece of text is explicitly tagged as expert quote or AI synthesis.
- **Exceptions are `{ trigger: Statement, action: Statement }`.**
- **Extra invariants beyond the prompt:**
  - `qualifier_not_in_quotes` (a preserved qualifier must occur in a quote);
  - `absolute_image_ref`;
  - `confirmation_result_mismatch` (`confirmed` needs `result: "confirmed"`).
- **`nextStatus`, confirmed + corrected → `unresolved` + new revision required.** The prompt only says a correction leads to a new revision. I chose this so a corrected rule stops teaching immediately, even if `current.json` lags. Revoked is terminal.
- **Eligibility is fail-closed:**
  - Unknown linked exchanges or events give `invalid`.
  - A missing `current.json` gives `superseded`.
  - An exchange about an off-record event counts as off-record.
  - A live entry built on fixture evidence counts as fixture.
- **`retrieve` checks how its input was pinned.** It accepts only entries produced by `selectEligible` (a WeakSet registry of frozen copies) and re-checks status and validity. An optional `ctx` triggers a full `isTeachable` re-check. `ctx` is an addition to the prompt's signature; it is optional, so the prompt's call shape still works.
- **`query.visual_context` is text (`string | null`).** WS6's `LearnerDraft.visual_context` is asset/region refs; WS6 or WS7 should pass a text description, or we extend this in Sprint 3.
- **TDD caveat:** tests were written alongside each module, not always strictly before it (red-first). Every module is covered.
- **`/speckit-*`:** the steps were run as a manual pass (spec, plan, tasks, consistency check in `tasks.md`). The skills were not invoked, because this session's cwd was a different worktree.

## Contract/interface changes

- **New WS5 types** (`ws5.v0`): `KnowledgeEntryContent`, `Statement`, `ExpertQuote`, `ExceptionRule`, `VisualEvidence`, `ConfirmationEvidence`, `KnowledgeCandidate`, `EligibilityContext`, `PinnedKnowledge`, `RetrievalQuery`, `RetrievalHit`.
- **Reused WS3 types:** `Region`, `SignalInterval`, `Source`, `ConfirmationStatus`, `ExpertExchange` and `PointingEvent` are imported from `@/lib/expert/contracts`. None are forked.
- **`EntryKind`** = WS3 `StepKind` + `escalation`.
- **Mapping:** the full mapping to WS6 `KnowledgeRevision` / `Confirmation` and to WS3 `DraftStep` / `ExpertConfirmation` is in `docs/knowledge-schema-v0.md` §7.

## Partner integration status

- **WS3:** real (merged `contracts.ts`). WS3 has no exchange fixtures, so WS5 created placeholder ones.
- **WS6:** not merged. The mapping is drafted from `notes/ws6-sprints/sprint-0-foundation-contracts.md` on branch `001-ws6-foundation-contracts`. To swap in our code, WS6 imports `selectEligible` (and `nextStatus`) from `@/lib/knowledge` in `web/lib/backend/modules.ts`, building candidates from `knowledge/entries/<id>/rev-<n>.md` via `parseEntryMarkdown` with `record_type: "knowledge_entry"` and the file path.
- **WS7:** nothing consumed yet. The schema doc defines what to render.

## Known limitations / open issues

- Quotes cannot span two answer lines (exact substring of one line).
- Retrieval is purely lexical. Synonyms or paraphrases from the learner won't match. This is acceptable for a small corpus; guardrails are always included regardless.
- An ambiguous-mapping event (`evt-004`) backing an entry is not rejected yet (open question for WS3).
- `status` living in the immutable `rev-<n>.md` frontmatter conflicts with later status changes. How WS6 stores status is an open question.

## Requests to partner workstreams

- **WS3:**
  - answer the questions in schema doc §8 (session- vs entry-scoped revisions, answer-line granularity, mixed teach-back results, ambiguous events);
  - consider shipping `ExpertExchange` fixtures, so WS5 can drop its placeholders.
- **WS6:**
  - call `selectEligible` instead of your stub;
  - move `current.json` to the new revision on correction;
  - confirm the `current.json` shape and where `status` is stored;
  - re-run `selectEligible` on any revoke, correct or off-record change; never reuse cached pins.
- **WS7:** style expert words and AI synthesis distinctly; answer the questions in §8.
- **WS4:** nothing this sprint.

## Human gate checklist (~15 min)

1. Read `notes/ws5-sprints/docs/knowledge-schema-v0.md`, from the worktree:
   `open /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-1/notes/ws5-sprints/docs/knowledge-schema-v0.md`
2. Open a rendered fixture in a Markdown viewer (e.g. VS Code preview):
   `web/fixtures/ws5/entries/ent-step-a/rev-1.md` (and `ent-guardrail-c/rev-1.md`). Check:
   - the expert's words are blockquotes with `exc-…` ids;
   - the AI synthesis is only under "Synthesis (AI, not expert words)" or tagged `[AI synthesis]`;
   - each entry shows a highlighted image (relative link into `web/public/fixtures/`) and at least one quote.
3. Optionally rerun: `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-1/web && npm run typecheck && npx vitest run`
4. Share the schema doc with the WS3, WS6 and WS7 owners.
5. Merge once the main checkout is clean and no other agent is mid-commit:
   ```bash
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws05-sprint-1
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-1
   ```

## Notes for the next sprint (Sprint 2: synthesis)

- **Output shape:** `synthesize()` should emit `KnowledgeEntryContent` drafts and run `validateEntry(entry, { exchanges, events })` on each. Report broken links; never fill them.
- **Quotes:** take them by slicing `answer_lines[].text` so that `findNonVerbatimQuotes` passes by construction.
- **Off-record:** exclude off-record exchanges and events before synthesis. Eligibility catches them anyway, but they must not appear in drafts at all.
- **Corrections:** on a correction, create `rev-(n+1)` with `parent_revision_id`, and apply `nextStatus(..., corrected)` to the reviewed revision.
- **Fixtures:** reuse `web/fixtures/ws5/` and `loadWs5Fixtures()`. After editing JSON, regenerate the `.md` files.
