// Guards the "no answer keys in the client" rule: evaluator-only fields from
// the WS4 brief (expected decision, acceptable explanations, common wrong
// decision, scoring) must never appear in fixtures served to the browser.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = /expected[_ ]?(decision|answer)|acceptable[_ ]?explanation|common[_ ]?wrong|scoring|answer[_ ]?key|rubric/i;

const root = path.resolve(__dirname, "../..");
const dirs = [path.join(root, "fixtures/ui"), path.join(root, "public/fixtures/ui")];

describe("fixtures", () => {
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      it(`${path.relative(root, dir)}/${file} has no evaluator-only content`, () => {
        expect(readFileSync(path.join(dir, file), "utf8")).not.toMatch(FORBIDDEN);
      });
    }
  }

  it("every JSON fixture is labelled source: fixture", () => {
    const dir = path.join(root, "fixtures/ui");
    for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      expect(data.source, file).toBe("fixture");
    }
  });
});
