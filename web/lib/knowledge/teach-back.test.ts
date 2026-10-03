import { describe, expect, it } from "vitest";
import { fixtureImageRef, loadSynthesisScenario } from "@/fixtures/ws5/synthesis/load";
import { synthesize } from "./synthesize";
import { buildTeachBack, TEACH_BACK_QUESTION } from "./teach-back";

const scenario = loadSynthesisScenario();
const out = synthesize({ events: scenario.events, exchanges: scenario.exchanges, confirmations: [], prior: [], resolve_image_ref: fixtureImageRef });
const ordered = out.workflow.steps.map(s => out.entries.find(e => e.entry_id === s.entry_id)!);

describe("buildTeachBack", () => {
  const tb = buildTeachBack(ordered)!;

  it("covers every step and guardrail, in workflow order", () => {
    expect(tb.items.map(i => i.entry_id)).toEqual(out.workflow.steps.map(s => s.entry_id));
    expect(tb.items.map(i => i.kind)).toContain("guardrail");
    expect(tb.items.map(i => i.kind)).toContain("escalation");
    for (const item of tb.items) expect(tb.text).toContain(item.text);
  });

  it("is process-shaped and ends with an explicit confirmation question", () => {
    expect(tb.text.startsWith("To interpret a trace like this: First,")).toBe(true);
    expect(tb.text).toContain("Stop and escalate");
    expect(tb.text).toContain("If your exception applies");
    expect(tb.text.endsWith(TEACH_BACK_QUESTION)).toBe(true);
    expect(tb.question).toBe(TEACH_BACK_QUESTION);
  });

  it("lists exactly the revisions reviewed, so a confirmation binds to them", () => {
    expect(tb.reviewed).toEqual(out.workflow.steps.map(s => ({ entry_id: s.entry_id, revision_id: s.revision_id })));
  });

  it("quotes only verbatim spans of the expert's answer lines", () => {
    const lines = scenario.exchanges.flatMap(x => x.answer_lines.map(l => l.text));
    const spans = [...tb.text.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) expect(lines.some(l => l.includes(s)), s).toBe(true);
  });

  it("names regions by pointing order, never by event id or session time", () => {
    expect(tb.text).not.toMatch(/evt-|sx-|\d+ ?ms/);
  });

  it("returns null when there is nothing to teach back, and skips revoked entries", () => {
    expect(buildTeachBack([])).toBeNull();
    const revoked = ordered.map(e => ({ ...e, status: "revoked" as const }));
    expect(buildTeachBack(revoked)).toBeNull();
  });
});
