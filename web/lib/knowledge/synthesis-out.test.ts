import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SYNTHESIS_FIXTURES_DIR } from "@/fixtures/ws5/synthesis/load";
import { buildSynthesisFixtureOutputs } from "@/fixtures/ws5/synthesis/outputs";

const outDir = join(SYNTHESIS_FIXTURES_DIR, "out");
const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [relative(outDir, p)];
  });

describe("committed synthesis output (fixtures/ws5/synthesis/out)", () => {
  const expected = buildSynthesisFixtureOutputs();

  it("matches what synthesis produces now (run lib/knowledge/dev/synthesize-fixtures.mts)", () => {
    expect(listFiles(outDir).sort()).toEqual(Object.keys(expected).sort());
    for (const [path, content] of Object.entries(expected)) {
      expect(readFileSync(join(outDir, path), "utf8"), path).toBe(content);
    }
  });

  it("links every image relatively to a file that exists", () => {
    for (const [path, content] of Object.entries(expected).filter(([p]) => p.endsWith(".md"))) {
      for (const m of content.matchAll(/\]\(<([^>]+)>\)/g)) {
        const target = join(outDir, path, "..", m[1]);
        expect(statSync(target).isFile(), `${path} → ${m[1]}`).toBe(true);
      }
    }
  });
});
