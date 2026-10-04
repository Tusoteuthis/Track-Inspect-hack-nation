// Probes inject system lines as user turns (simulations cannot carry contextual
// updates). This keeps those lines identical to what the app actually sends.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import { controlNudge, formatPointingEventUpdate } from "./context-update";

type Probes = { expert: { cases: { name: string; history?: { role: string; text: string }[] }[] } };

const root = join(__dirname, "..", "..", "..");
const dir = join(__dirname, "..", "..", "fixtures", "pointing-events");
const fixtures: PointingEvent[] = readdirSync(dir).map(f => JSON.parse(readFileSync(join(dir, f), "utf8")));

/** Every text the app can send for a fixture event or nudge. */
const sendable = new Set<string>();
for (const e of fixtures) {
  for (const stale of [false, true]) {
    for (const guardrailPending of [false, true]) sendable.add(formatPointingEventUpdate(e, { stale, guardrailPending }));
  }
  sendable.add(controlNudge(e.event_id));
}

describe.each(["probes.json", "probes.example.json"])("%s", file => {
  const probes: Probes = JSON.parse(readFileSync(join(root, "agents", file), "utf8"));
  const lines = probes.expert.cases.flatMap(c =>
    (c.history ?? []).filter(t => /^\[(POINTING_EVENT|CONTROL)\]/.test(t.text)).map(t => [c.name, t.text] as const)
  );

  it("has system lines to check", () => expect(lines.length).toBeGreaterThan(5));

  it.each(lines)("%s: system line matches the app's wording", (_name, text) => {
    expect(sendable.has(text)).toBe(true);
  });
});
