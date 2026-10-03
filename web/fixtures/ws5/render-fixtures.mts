// Regenerates entries/<entry_id>/rev-<n>.md from the fixture JSON next to it.
// Run after editing a fixture: npx tsx fixtures/ws5/render-fixtures.mts
// markdown.test.ts fails if a committed .md file drifts from its JSON.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEntryMarkdown } from "@/lib/knowledge/markdown";
import { loadWs5Fixtures, WS5_FIXTURES_DIR } from "./load";

for (const c of loadWs5Fixtures().candidates) {
  const file = join(WS5_FIXTURES_DIR, "entries", c.entry.entry_id, `${c.entry.revision_id}.md`);
  writeFileSync(file, renderEntryMarkdown(c.entry));
  console.log("wrote", file);
}
