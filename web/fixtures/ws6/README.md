# WS6 fixtures (`ws6.v0`)

These files are **labelled fixtures** for contract tests and local development. They are never real expert knowledge and never real captures.

- All text is neutral placeholder text (`FIXTURE …`). It carries no trace interpretation.
- Every record that has a `source` field (or `produced_by.source`) uses `"fixture"`.
- Every session-scoped record uses `session_id: "fixture-session-001"`, including `session-newcomer.json`. The expert and newcomer session fixtures are alternative shapes for the same ID and are never stored together.
- IDs are consistent across files: `fixture-event-001`, `fixture-exchange-001`, `fixture-asset-001`, `fixture-entry-001`, `rev-20261003100500-fx0001` (knowledge revision) and `rev-1` (WS3 draft revision).
- `fixture-frame.png` and `fixture-frame-highlighted.png` are synthetic 320x180 placeholders written by `web/scripts/make-fixture-pngs.mts`. Each carries a PNG `tEXt` chunk `Comment=FIXTURE placeholder, not real capture`. `evidence-asset.json` records their sha256 and size. If you regenerate them, update that file.
- `knowledge-revision.md` stores its frontmatter as **JSON between `---` lines**. JSON is valid YAML, so YAML tools read it too. WS6 parses the block with `JSON.parse` and validates it with `KnowledgeRevisionSchema`. The body is opaque WS5 Markdown.
- The tests in `web/lib/contracts/contracts.test.ts` map each JSON file to its schema.
