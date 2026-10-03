// Dev only: writes the fixture scenario's synthesis output to web/fixtures/ws5/synthesis/out/ for
// the human gate (open out/workflow.md in a Markdown viewer). Run from web/:
//   npx tsx lib/knowledge/dev/synthesize-fixtures.mts

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SYNTHESIS_FIXTURES_DIR } from "@/fixtures/ws5/synthesis/load";
import { buildSynthesisFixtureOutputs } from "@/fixtures/ws5/synthesis/outputs";

const outDir = join(SYNTHESIS_FIXTURES_DIR, "out");
rmSync(outDir, { recursive: true, force: true });
for (const [path, content] of Object.entries(buildSynthesisFixtureOutputs())) {
  const file = join(outDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log("wrote", file);
}
