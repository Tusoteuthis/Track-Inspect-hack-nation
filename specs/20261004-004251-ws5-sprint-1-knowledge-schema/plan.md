# Implementation Plan: WS5 Sprint 1

**Constitution check:**
- I/II: no interpretation is invented; quotes are verbatim, and synthesis is tagged and separated.
- III: each entry needs ≥1 event and ≥1 exchange.
- IV: session time and signal time are separate.
- V: fixtures carry `source: "fixture"`.
- VI: eligibility excludes off-record evidence.
- VIII: no new dependencies; validators are hand-written like WS3's.

**Structure:**
```
web/lib/knowledge/  schema.ts markdown.ts status.ts eligibility.ts retrieve.ts index.ts  (+ *.test.ts)
web/fixtures/ws5/   exchanges/*.json  entries/<entry_id>/rev-<n>.json + current.json  rendered/*.md  load.ts
```

**Key design choices:**
- Frontmatter is `key: <JSON>` per line. That is valid YAML and needs no parser dependency.
- Interpretation/Reasoning items are rendered in their section when they are expert quotes. When they are AI synthesis they go under the Synthesis heading with a section tag. A `<!-- ws5:… -->` comment carries the item index, so parsing is lossless.
- Visual evidence renders image links plus a `<!-- ws5:visual {...} -->` comment holding region and time data.
- Eligibility checks a fixed reason order, and an unknown link fails closed as `invalid`.
- Retrieval is token overlap plus a kind priority. Guardrails and escalation rules are always included, and the limit never drops them.

Full plan: `~/.claude/plans/pasted-content-id-b7f8-ws5-sprint-nested-pike.md` (copied in the handoff decisions).
