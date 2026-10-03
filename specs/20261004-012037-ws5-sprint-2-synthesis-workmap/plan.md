# Plan: WS5 Sprint 2

Step text: **deterministic** templates (no domain nouns); quotes are whole answer lines sliced verbatim. No LLM pass: no provider key in `web/.env`.

Modules in `web/lib/knowledge/`:
- `synthesis-types.ts` — input/output types (Gap, TeachBack, WorkflowDoc, WorkMapContent).
- `cues.ts` — fixed linguistic cue lists (hedges, exception, guardrail, escalation). Linguistic only, no domain meaning.
- `material.ts` — on-record filter and line→role classification shared by synthesis and gaps.
- `synthesize.ts` — grouping, entry building, revisions (FNV-1a content hash), corrections, workflow, `renderWorkflowMarkdown`.
- `gaps.ts` — `findGaps`.
- `teach-back.ts` — `buildTeachBack`.
- `workmap.ts` — `buildWorkMap`.
- `adapters/ws3-synthesis.ts`, `adapters/ws6-synthesis-module.ts`.
- `dev/synthesize-fixtures.mts` — writes `web/fixtures/ws5/synthesis/out/`.

Schema change (own module): optional `change_reason?: string | null` on `KnowledgeEntryContent`, rendered in frontmatter only when present (S1 fixtures unchanged).

Partner interfaces: WS3 Sprint 3 and WS6 Sprint 2 not merged on `voice` → adapters implement the documented signatures as WS5-side structural types.
