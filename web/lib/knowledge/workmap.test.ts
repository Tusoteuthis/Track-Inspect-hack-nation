import { describe, expect, it } from "vitest";
import { fixtureImageRef, loadSynthesisScenario, OFF_RECORD_MARKERS } from "@/fixtures/ws5/synthesis/load";
import type { KnowledgeEntryContent } from "./schema";
import { synthesize } from "./synthesize";
import { buildWorkMap, type WorkMapInput } from "./workmap";

const scenario = loadSynthesisScenario();
const out = synthesize({ events: scenario.events, exchanges: scenario.exchanges, confirmations: [], prior: [], resolve_image_ref: fixtureImageRef });
const confirm = (e: KnowledgeEntryContent): KnowledgeEntryContent => ({
  ...e,
  status: "confirmed",
  confirmation: { confirmation_id: "cnf-ok", revision_id_reviewed: e.revision_id, result: "confirmed", expert_response_exchange_id: "sx-001" },
});
const input = (over: Partial<WorkMapInput> = {}): WorkMapInput => ({
  workflow: out.workflow,
  revisions: out.entries,
  events: scenario.events,
  exchanges: scenario.exchanges,
  ...over,
});

describe("buildWorkMap", () => {
  it("shows only confirmed content by default and says what it left out", () => {
    const map = buildWorkMap(input());
    expect(map.steps).toEqual([]);
    expect(map.excluded.map(x => x.entry_id)).toEqual(out.workflow.steps.map(s => s.entry_id));
    expect(map.excluded[0].reason).toContain("draft");
  });

  it("include_draft returns every step in workflow order with its status", () => {
    const map = buildWorkMap(input({ include_draft: true }));
    expect(map.steps.map(s => s.entry_id)).toEqual(out.workflow.steps.map(s => s.entry_id));
    expect(map.steps.every(s => s.status === "draft")).toBe(true);
    expect(map.steps.map(s => s.position)).toEqual(out.workflow.steps.map(s => s.position));
  });

  it("every step has a visual and a verbatim quote, or reports a broken link", () => {
    const map = buildWorkMap(input({ include_draft: true }));
    for (const s of map.steps) {
      const complete = s.visual.length > 0 && s.expert_words.length > 0;
      expect(complete || s.broken_links.length > 0).toBe(true);
      expect(complete).toBe(true); // the scenario links everything
      expect(s.broken_links).toEqual([]);
      for (const w of s.expert_words) {
        const x = scenario.exchanges.find(e => e.exchange_id === w.exchange_id)!;
        expect(x.answer_lines.some(l => l.text.includes(w.quote))).toBe(true);
        expect(w.question).toBe(x.question);
      }
    }
  });

  it("keeps synthesis tagged as AI and guardrails linked to the expert's words", () => {
    const map = buildWorkMap(input({ include_draft: true }));
    const guard = map.steps.find(s => s.entry_id === "ent-evt-001-guardrail")!;
    expect(guard.synthesis.length).toBeGreaterThan(0);
    expect(guard.synthesis.every(x => x.type === "ai_synthesis")).toBe(true);
    expect(guard.guardrails).toHaveLength(1);
    expect(guard.guardrails[0].trigger.type).toBe("expert_quote");
    expect(guard.guardrails[0].expert_words[0]).toMatchObject({ exchange_id: "sx-002" });
    expect(guard.visual[0]).toMatchObject({ event_id: "evt-001", asset_id: null });
  });

  it("shows confirmed steps by default, and with an eligibility context only teachable ones", () => {
    const revisions = out.entries.map(e => (e.entry_id === "ent-evt-001-step" ? confirm(e) : e));
    expect(buildWorkMap(input({ revisions })).steps.map(s => s.entry_id)).toEqual(["ent-evt-001-step"]);
    const current = Object.fromEntries(out.entries.map(e => [e.entry_id, e.revision_id]));
    const strict = buildWorkMap(input({ revisions, eligibility: { current_revision_by_entry: current, allow_fixture: false } }));
    expect(strict.steps).toEqual([]);
    expect(strict.excluded.find(x => x.entry_id === "ent-evt-001-step")?.reason).toContain("fixture_not_allowed");
  });

  it("reports missing events, exchanges, assets and revisions instead of dropping them", () => {
    const map = buildWorkMap(
      input({
        include_draft: true,
        events: scenario.events.filter(e => e.event_id !== "evt-002"),
        exchanges: scenario.exchanges.filter(x => x.exchange_id !== "sx-003"),
        revisions: out.entries.filter(e => e.entry_id !== "ent-evt-004-step"),
        assets: [],
      })
    );
    const step2 = map.steps.find(s => s.entry_id === "ent-evt-002-step")!;
    expect(step2.broken_links.join("\n")).toContain("event evt-002 not found");
    expect(step2.broken_links.join("\n")).toContain("exchange sx-003 not found");
    expect(step2.expert_words).toEqual([]);
    expect(step2.broken_links.join("\n")).toContain("no verbatim expert words");
    const missing = map.steps.find(s => s.entry_id === "ent-evt-004-step")!;
    expect(missing.broken_links).toEqual(["revision ent-evt-004-step@rev-1 not found"]);
  });

  it("drops a non-verbatim quote and says so", () => {
    const tampered = out.entries.map(e =>
      e.entry_id === "ent-evt-004-step" ? { ...e, expert_words: [{ exchange_id: "sx-005", quote: "FIXTURE: this one is definitely pattern D." }] } : e
    );
    const step = buildWorkMap(input({ include_draft: true, revisions: tampered })).steps.find(s => s.entry_id === "ent-evt-004-step")!;
    expect(step.expert_words).toEqual([]);
    expect(step.broken_links.join("\n")).toContain("not verbatim");
  });

  it("uses asset refs when an asset is known", () => {
    const assets = [{ asset_id: "ast-001", event_id: "evt-001", original_ref: "images/ast-001/original.png", highlighted_ref: "images/ast-001/highlighted.png" }];
    const step = buildWorkMap(input({ include_draft: true, assets })).steps.find(s => s.entry_id === "ent-evt-001-step")!;
    expect(step.visual[0]).toMatchObject({ asset_id: "ast-001", original_ref: "images/ast-001/original.png" });
  });

  it("never includes revoked or off-record material", () => {
    const revoked = out.entries.map(e =>
      e.entry_id === "ent-evt-001-guardrail" ? { ...e, status: "revoked" as const, revoked_at_utc: "2026-10-03T11:00:00.000Z", revoked_reason: "withdrawn" } : e
    );
    const map = buildWorkMap(input({ include_draft: true, revisions: revoked }));
    expect(map.steps.map(s => s.entry_id)).not.toContain("ent-evt-001-guardrail");
    expect(map.excluded.find(x => x.entry_id === "ent-evt-001-guardrail")?.reason).toContain("revoked");
    const json = JSON.stringify(map);
    for (const marker of OFF_RECORD_MARKERS) expect(json).not.toContain(marker);
  });
});
