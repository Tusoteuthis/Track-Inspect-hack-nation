# WS5 Sprint Plan: Knowledge and Newcomer Tutor

**Derived from:** [../05-knowledge-newcomer-tutor.md](../05-knowledge-newcomer-tutor.md)
**Updated:** 3 October 2026
**Execution:** coding agents, one spec-kit feature per sprint, each in its own git worktree, with a human gate between sprints. Paste-ready prompts are in this folder (see [README](README.md)).

## Verdict: split into 4 vertical sprints

The brief covers six subsystems with different dependencies:

1. knowledge schema
2. synthesis, gaps and confirmation
3. Work Map content
4. retrieval
5. tutor evaluation with pre-save intervention
6. assessment and trust

Three things make building all of it at once a bad idea:

- **Partners need our contracts early.** WS6 hosts our modules behind stubs (`SynthesisModule`, `TutorEvaluator`, eligibility, assessment). WS3 puts its synthesis behind `web/lib/expert/synthesis.ts` for us to replace. WS7 renders our Work Map content.
- **The riskiest part needs its own verification.** The tutor's judgement of a free-form draft needs an LLM, and it must be guarded so that it never invents rules or uses an answer key.
- **One large build can't be checked.** Agents need acceptance criteria per unit of work that they can verify themselves; one giant diff can't be verified.

## Decisions

- **Scope:** sensor traces on a screen only. No plans, drawings or field maintenance.
- **Ownership:** WS5 builds domain logic only, as pure TypeScript modules in `web/lib/knowledge/`.
  - WS6 owns routes, storage, jobs and the commit guard.
  - WS7 owns all screens, including the Work Map and newcomer UI.
  - WS5 also owns the tutor ElevenLabs agent prompt.
- **Stack:** TypeScript / Next.js (existing `web/` app), vitest (added by WS3 Sprint 0).
- **Newcomer task:** generic *draft decision + reason → review → commit* until WS4 and the expert define it. WS5 adds no domain categories.
- **Retrieval:** small, explainable, lexical ranking with kind priority. No vector DB, no embeddings.
- **Synthesis:** deterministic by default (verbatim quotes + template process phrasing). An LLM rephrasing pass is optional and guarded.
- **Development:** against labelled fixtures until WS2/WS3/WS4 deliver real inputs.
- **Shared constitution:** WS5 follows `.specify/memory/constitution.md` (WS3 Sprint 0) and does not write its own.

## Sprints

| Sprint | Scope | Done when | Depends on |
|---|---|---|---|
| **S1 — Knowledge schema, eligibility & retrieval** (agent ~1.5–2h, human ~15 min) | Entry schema `ws5.v0` + Markdown round trip; invariants (visual + verbatim quote per step, revision-bound confirmation); `nextStatus`; `isTeachable` / `selectEligible`; lexical retrieval; labelled fixtures; `notes/ws5-sprints/docs/knowledge-schema-v0.md` | Only confirmed, current, on-record, valid revisions are eligible; every invariant tested; schema doc shared with WS3/WS6/WS7 | WS3 Sprint 0 merged (constitution, vitest, contracts) |
| **S2 — Synthesis, gaps, teach-back & Work Map content** (~2–3h, ~20 min) | `synthesize()` (many-to-many evidence, qualifiers → gaps, off-record excluded); revisions on correction + dependent flags; genuine gaps (never padded); process-level teach-back bound to revisions; `WorkMapContent` with `broken_links`; adapters for WS3 `synthesis.ts` and WS6 `SynthesisModule` | Correction → new revision → changed retrieval; every Work Map step resolves to an image + verbatim words or reports a broken link | S1; WS3 S3 / WS6 S2 interfaces (real or documented signature) |
| **S3 — Tutor evaluation & pre-save intervention** (~3–4h, ~25 min, **highest risk**) | `evaluate()` with deterministic input/output guards around an LLM judge; outcomes `ok / intervene / uncertain` with verbatim citations; escalation instead of invented rules; anti-cheating tests (no case IDs, no evaluator paths); timeline caught-before-save vs after-save; WS6 `TutorEvaluator` adapter; position on WS6 outcome policy | A wrong fixture draft gets `intervene` citing real expert words in ≥ 4/5 runs; uncovered case → `uncertain` + escalation; anti-cheating tests pass | S2; **decision D1**; WS6 S3 interface |
| **S4 — Voice tutor, screen observation, assessment & trust** (~3h, ~30 min live) | Tutor agent prompt + probes (asks before telling, cites only delivered quotes); screen-context contract with WS7; assessment (unassisted / after help / unresolved, practise next, honest limitations); revocation and off-record propagation tests; end-to-end script; dev harness only if WS7 is missing | Live: wrong decision blocked before save, explained with the expert's words, corrected, assessed; every brief §12 criterion mapped to evidence | S3; WS3 voice interface (WS3 S4); WS6 S3–S4; WS7 newcomer screen |

S1 → S2 → S3 → S4 run sequentially (each merges into `voice` before the next starts). Lanes inside a sprint run in parallel.

**Totals:** ~10–12 h agent wall-clock, ~1.5 h human gates.

## Cross-workstream sync points

| When | With | What |
|---|---|---|
| Before S1 | WS3 | Their Sprint 0 merged (constitution, vitest, `contracts.ts`) |
| After S1 | WS3, WS6, WS7 | Share `notes/ws5-sprints/docs/knowledge-schema-v0.md`; WS6 maps `KnowledgeRevision` to it and uses `selectEligible` |
| After S2 | WS3, WS6 | Swap their synthesis stubs for our adapters |
| Before S3 | Human | Decide **D1** (evaluation mechanism / LLM provider) |
| After S3 | WS6 | Agree on the outcome policy (`ok` allow, `intervene` block, `uncertain` allow with escalation) |
| During S4 | WS4, WS7 | Real unseen case + task definition; newcomer screen + screen-share capture |

## Open decisions

- **D1, evaluation mechanism — DECIDED 2026-10-04 (human):** option (a), a server-side Anthropic LLM judge (`claude-opus-5-5`, structured JSON output via `@anthropic-ai/sdk`) wrapped in deterministic input/output guards. Key: `ANTHROPIC_API_KEY` in `web/.env`.
- **Time budget** per sprint (hackathon schedule).
- **Exact newcomer task and save boundary** (WS4 + expert). S3 stays generic until then.
- **Field names** for WS2/WS3 handoffs: agree when S1 publishes the schema.
- **Retention and deletion semantics** for revoked or off-record material (with WS3/WS6). WS5 guarantees non-eligibility; WS6 decides physical deletion.
