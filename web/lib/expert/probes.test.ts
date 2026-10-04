// Probes inject system lines as user turns (simulations cannot carry contextual
// updates). This keeps those lines identical to what the app actually sends.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import { controlNudge, formatPointingEventUpdate } from "./context-update";
import { PROBE_ANSWERS, PROBE_TEACH_BACK_SPOKEN, PROBE_TOOL_PARAMS, probeSystemLines } from "./probe-lines";

type ToolTurn = { name: string; params: unknown; result: string };
type Probes = {
  expert: { toolMocks?: Record<string, string>; cases: { name: string; toolMocks?: Record<string, string>; history?: { role: string; text?: string; tool?: ToolTurn }[] }[] };
};

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
// Sprint 3 phase blocks, produced by the real reducer for the probe fixture session.
const phase = probeSystemLines();
for (const text of [phase.debrief, phase.controlDebrief, phase.teachBack, phase.controlTeachBack]) sendable.add(text);

describe.each(["probes.json", "probes.example.json"])("%s", file => {
  const probes: Probes = JSON.parse(readFileSync(join(root, "agents", file), "utf8"));
  const lines = probes.expert.cases.flatMap(c =>
    (c.history ?? [])
      .filter((t): t is { role: string; text: string } => typeof t.text === "string" && /^\[(POINTING_EVENT|CONTROL|PHASE|TEACH_BACK)/.test(t.text))
      .map(t => [c.name, t.text] as const)
  );

  it("has system lines to check", () => expect(lines.length).toBeGreaterThan(5));

  it.each(lines)("%s: system line matches the app's wording", (_name, text) => {
    expect(sendable.has(text)).toBe(true);
  });
});

describe.each(["probes.json", "probes.example.json"])("%s replayed tool calls", file => {
  const probes: Probes = JSON.parse(readFileSync(join(root, "agents", file), "utf8"));
  const tools = probes.expert.cases.flatMap(c => (c.history ?? []).flatMap(t => (t.tool ? [[c.name, t.tool] as const] : [])));
  const known = Object.entries(PROBE_TOOL_PARAMS).map(([key, params]) => ({ params, result: phase.results[key] }));

  it("has tool turns to check", () => expect(tools.length).toBeGreaterThan(10));

  it.each(tools)("%s: tool params and result are what the app produces", (_name, tool) => {
    expect(known).toContainEqual({ params: tool.params, result: tool.result });
  });
});

describe.each(["probes.json", "probes.example.json"])("%s correction replay", file => {
  const probes: Probes = JSON.parse(readFileSync(join(root, "agents", file), "utf8"));
  it("mocks propose_draft with the app's real rev-2 result", () => {
    expect(probes.expert.toolMocks?.propose_draft).toBe(phase.proposeRev2);
  });
  it("the correction case replays the same teach-back and correction", () => {
    const texts = probes.expert.cases.find(c => c.name === "teach-back-correction")!.history!.map(t => t.text);
    expect(texts).toContain(PROBE_TEACH_BACK_SPOKEN);
    expect(texts.at(-1)).toBe(PROBE_ANSWERS.correction);
  });
});

describe.each(["probes.json", "probes.example.json"])("%s off-record and strike mocks", file => {
  const probes: Probes = JSON.parse(readFileSync(join(root, "agents", file), "utf8"));
  const mocks = (name: string) => probes.expert.cases.find(c => c.name === name)?.toolMocks;
  it("each case mocks its tool with the app's real result", () => {
    expect(mocks("off-record")).toEqual({ set_record_state: phase.results.setOff });
    expect(mocks("back-on-record")).toEqual({ set_record_state: phase.results.setOn });
    expect(mocks("strike-last")).toEqual({ strike_last_answer: phase.strike });
  });
  it("the off-record answers are the ones the app excludes", () => {
    const texts = probes.expert.cases.find(c => c.name === "back-on-record")!.history!.map(t => t.text);
    for (const line of [PROBE_ANSWERS.offRecord, PROBE_ANSWERS.offRecordMore, PROBE_ANSWERS.backOn]) expect(texts).toContain(line);
  });
});
