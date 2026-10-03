// Synthesis scenario for WS5 Sprint 2 tests and the dev script. Placeholder FIXTURE wording on
// WS3's fixture events; not domain knowledge. sx-006 (off-record gesture) and sx-007 (off-record
// exchange) carry OFFRECORD-MARKER strings that must never appear in any synthesis output.
// sx-010 + cnf-sx-001 are the expert's correction during the teach-back.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpertConfirmation, ExpertExchange, PointingEvent } from "@/lib/expert/contracts";

export const SYNTHESIS_FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = join(SYNTHESIS_FIXTURES_DIR, "..", "..", "pointing-events");
export const OFF_RECORD_MARKERS = ["OFFRECORD-MARKER-EVT5", "OFFRECORD-MARKER-SX7"] as const;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const readDir = <T>(dir: string): T[] =>
  readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .map(f => readJson<T>(join(dir, f)));

export type SynthesisScenario = {
  events: PointingEvent[];
  exchanges: ExpertExchange[];
  correction: ExpertConfirmation;
};

export function loadSynthesisScenario(): SynthesisScenario {
  return {
    events: readDir<PointingEvent>(EVENTS_DIR),
    exchanges: readDir<ExpertExchange>(join(SYNTHESIS_FIXTURES_DIR, "exchanges")),
    correction: readDir<ExpertConfirmation>(join(SYNTHESIS_FIXTURES_DIR, "confirmations"))[0],
  };
}

/**
 * From `out/entries/<entry_id>/rev-<n>.md` to `web/public/<ref>`. Event refs are web-root paths
 * ("/fixtures/…"); entries need relative links so they open in a Markdown viewer.
 */
export const fixtureImageRef = (ref: string) => `../../../../../../public${ref}`;
