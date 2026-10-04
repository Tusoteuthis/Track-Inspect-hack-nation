// Guard for B2 "UI does not trigger speech": the companion displays pointing
// and requests session changes, but never sends anything to the voice agent.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["components/companion", "lib/companion", "app/expert"];
const FORBIDDEN = /sendContextualUpdate|sendUserMessage|sendMultimodalMessage|deliverFixture|sendUserActivity/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("expert companion never makes the agent speak", () => {
  it.each(DIRS)("%s contains no call that sends to the agent", dir => {
    expect(files(join(ROOT, dir)).length).toBeGreaterThan(0);
    const offenders = files(join(ROOT, dir)).filter(f => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
