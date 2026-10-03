// Test/dev loader for the WS5 fixtures. Everything here is source: "fixture" and uses
// the shared fixture-session-001; expert wording is placeholder text, not domain knowledge.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import type { KnowledgeCandidate } from "@/lib/knowledge/eligibility";
import type { KnowledgeEntryContent } from "@/lib/knowledge/schema";

export const WS5_FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = join(WS5_FIXTURES_DIR, "..", "pointing-events");

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const jsonFiles = (dir: string) => readdirSync(dir).filter(f => f.endsWith(".json")).sort();

export type Ws5Fixtures = {
  exchanges: ExpertExchange[];
  events: PointingEvent[];
  /** One candidate per stored revision; `path` is the Markdown file next to the JSON. */
  candidates: KnowledgeCandidate[];
  current_revision_by_entry: Record<string, string>;
};

export function loadWs5Fixtures(): Ws5Fixtures {
  const exchangesDir = join(WS5_FIXTURES_DIR, "exchanges");
  const entriesDir = join(WS5_FIXTURES_DIR, "entries");
  const candidates: KnowledgeCandidate[] = [];
  const current: Record<string, string> = {};

  for (const entryId of readdirSync(entriesDir).sort()) {
    const dir = join(entriesDir, entryId);
    for (const file of jsonFiles(dir)) {
      if (file === "current.json") {
        current[entryId] = readJson<{ revision_id: string }>(join(dir, file)).revision_id;
      } else {
        candidates.push({
          record_type: "knowledge_entry",
          path: `fixtures/ws5/entries/${entryId}/${file.replace(/\.json$/, ".md")}`,
          entry: readJson<KnowledgeEntryContent>(join(dir, file)),
        });
      }
    }
  }

  return {
    exchanges: jsonFiles(exchangesDir).map(f => readJson<ExpertExchange>(join(exchangesDir, f))),
    events: jsonFiles(EVENTS_DIR).map(f => readJson<PointingEvent>(join(EVENTS_DIR, f))),
    candidates,
    current_revision_by_entry: current,
  };
}

export function fixtureEntry(entryId: string, revisionId = "rev-1"): KnowledgeEntryContent {
  return readJson<KnowledgeEntryContent>(join(WS5_FIXTURES_DIR, "entries", entryId, `${revisionId}.json`));
}
