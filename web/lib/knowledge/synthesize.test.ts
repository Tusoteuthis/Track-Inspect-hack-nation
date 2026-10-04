import { describe, expect, it } from "vitest";
import type { ExpertExchange } from "@/lib/expert/contracts";
import { fixtureImageRef, loadSynthesisScenario, OFF_RECORD_MARKERS } from "@/fixtures/ws5/synthesis/load";
import { fixtureEntry } from "@/fixtures/ws5/load";
import { assertQuotesVerbatim, validateEntry, type KnowledgeEntryContent } from "./schema";
import { contentHash, renderWorkflowMarkdown, synthesize } from "./synthesize";
import type { SynthesisInput } from "./synthesis-types";

const scenario = loadSynthesisScenario();
const base = (over: Partial<SynthesisInput> = {}): SynthesisInput => ({
  events: scenario.events,
  exchanges: scenario.exchanges,
  confirmations: [],
  prior: [],
  resolve_image_ref: fixtureImageRef,
  ...over,
});
const byId = (entries: KnowledgeEntryContent[], id: string) => {
  const e = entries.find(x => x.entry_id === id);
  if (!e) throw new Error(`no entry ${id} in ${entries.map(x => x.entry_id).join(", ")}`);
  return e;
};
/** The first run's entries, confirmed by the expert (what WS6 would hold before the correction). */
const confirmedRun1 = () =>
  synthesize(base()).entries.map(e => ({
    ...e,
    status: "confirmed" as const,
    confirmation: { confirmation_id: "cnf-ok", revision_id_reviewed: e.revision_id, result: "confirmed" as const, expert_response_exchange_id: "sx-010" },
  }));

describe("synthesize on the fixture scenario", () => {
  const out = synthesize(base());

  it("produces draft entries that pass validateEntry with verbatim quotes", () => {
    expect(out.entries.length).toBeGreaterThan(0);
    for (const e of out.entries) {
      const v = validateEntry(e, { exchanges: scenario.exchanges, events: scenario.events });
      expect(v.ok, JSON.stringify(v)).toBe(true);
      expect(() => assertQuotesVerbatim(e, scenario.exchanges)).not.toThrow();
      expect(e.status).toBe("draft");
      expect(e.source).toBe("fixture");
      expect(e.revision_id).toBe("rev-1");
    }
  });

  it("groups one entry per moment and role", () => {
    expect(out.entries.map(e => `${e.entry_id}:${e.kind}`).sort()).toEqual([
      "ent-evt-001-exception:exception",
      "ent-evt-001-guardrail:guardrail",
      "ent-evt-001-step:decision",
      "ent-evt-002-escalation:escalation",
      "ent-evt-002-guardrail:guardrail",
      "ent-evt-002-step:step",
      "ent-evt-004-step:step",
    ]);
  });

  it("supports many-to-many evidence", () => {
    const exchangesOf = (id: string) => byId(out.entries, id).expert_words.map(q => q.exchange_id);
    // one exchange (sx-002) supports a decision and a guardrail
    expect(exchangesOf("ent-evt-001-step")).toContain("sx-002");
    expect(exchangesOf("ent-evt-001-guardrail")).toContain("sx-002");
    // one entry is supported by several exchanges
    expect(new Set(exchangesOf("ent-evt-001-step"))).toEqual(new Set(["sx-001", "sx-002"]));
  });

  it("keeps expert words, observation and synthesis separate and preserves qualifiers", () => {
    const step = byId(out.entries, "ent-evt-002-step");
    expect(step.workflow_step?.type).toBe("ai_synthesis");
    expect(step.observation?.type).toBe("ai_synthesis");
    expect(step.expert_words).toContainEqual({ exchange_id: "sx-003", quote: "It is normally FIXTURE decision B." });
    expect(step.qualifiers).toEqual(["normally"]);
  });

  it("turns a hedge without a stated exception into a gap, not a rule", () => {
    const step = byId(out.entries, "ent-evt-002-step");
    expect(step.exceptions).toEqual([]);
    expect(step.kind).toBe("step");
    expect(out.gaps.map(g => g.gap_id)).toContain("gap-unqualified_exception-evt-002");
  });

  it("never lets off-record words or moments into any output field", () => {
    const json = JSON.stringify(out);
    for (const marker of OFF_RECORD_MARKERS) expect(json).not.toContain(marker);
    expect(json).not.toContain("sx-006");
    expect(json).not.toContain("sx-007");
    expect(json).not.toContain("evt-005");
  });

  it("uses relative image links and never derives signal time", () => {
    for (const e of out.entries) {
      for (const v of e.visual_evidence) {
        expect(v.image_ref.startsWith("../")).toBe(true);
        expect(v.signal_interval).toBeNull();
      }
    }
  });

  it("is deterministic", () => {
    expect(synthesize(base())).toEqual(out);
  });

  it("orders the workflow logically, not by recording time, and keeps the timeline", () => {
    expect(out.workflow.steps.map(s => s.kind)).toEqual([
      "decision",
      "step",
      "step",
      "exception",
      "guardrail",
      "guardrail",
      "escalation",
    ]);
    expect(out.workflow.steps.map(s => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const e of out.entries) {
      const step = out.workflow.steps.find(s => s.entry_id === e.entry_id);
      expect(step?.revision_id).toBe(e.revision_id);
      expect(e.workflow_position).toBe(step?.position);
    }
    expect(out.workflow.timeline.map(t => t.event_id)).toEqual(["evt-001", "evt-002", "evt-004"]);
  });

  it("renders workflow.md with relative links to each entry revision", () => {
    const md = renderWorkflowMarkdown(out.workflow);
    expect(md).toContain("(<entries/ent-evt-001-step/rev-1.md>)");
    expect(md).not.toMatch(/\]\(<\//);
    expect(md).toContain("Session timeline");
  });
});

describe("revisions", () => {
  it("creates no new revision when the inputs are unchanged", () => {
    const first = synthesize(base());
    const again = synthesize(base({ prior: first.entries }));
    expect(again.entries).toEqual([]);
    expect(again.workflow.steps.map(s => `${s.entry_id}@${s.revision_id}`)).toEqual(
      first.workflow.steps.map(s => `${s.entry_id}@${s.revision_id}`)
    );
    expect(again.flagged_for_reconfirmation).toEqual([]);
  });

  it("creates rev-2 with parent and change_reason when the support changes", () => {
    const first = synthesize(base({ exchanges: scenario.exchanges.filter(x => x.exchange_id !== "sx-002") }));
    const next = synthesize(base({ prior: first.entries }));
    const step = byId(next.entries, "ent-evt-001-step");
    expect(step.revision_id).toBe("rev-2");
    expect(step.parent_revision_id).toBe("rev-1");
    expect(step.change_reason).toContain("sx-002");
  });

  it("a correction revises only the entry it touches and flags dependents", () => {
    const prior = confirmedRun1();
    const out = synthesize(base({ prior, confirmations: [scenario.correction] }));
    expect(out.entries.map(e => e.entry_id)).toEqual(["ent-evt-001-step"]);
    const rev2 = out.entries[0];
    expect(rev2.revision_id).toBe("rev-2");
    expect(rev2.parent_revision_id).toBe("rev-1");
    expect(rev2.status).toBe("draft");
    expect(rev2.change_reason).toContain("sx-010 (correction cnf-sx-001)");
    expect(rev2.expert_words).toContainEqual({ exchange_id: "sx-010", quote: "No, FIXTURE decision A also needs FIXTURE cue A2." });
    expect(contentHash(rev2)).not.toBe(contentHash(byId(prior, "ent-evt-001-step")));

    // the entries sharing evt-001 / sx-002 with the corrected one need re-confirmation
    expect(out.flagged_for_reconfirmation.map(f => f.entry_id)).toEqual(["ent-evt-001-exception", "ent-evt-001-guardrail"]);
    for (const f of out.flagged_for_reconfirmation) expect(f.reason).toContain("sx-010");
    // the workflow now points at rev-2; the teach-back reviews it
    expect(out.workflow.steps.find(s => s.entry_id === "ent-evt-001-step")?.revision_id).toBe("rev-2");
    expect(out.teach_back?.reviewed).toContainEqual({ entry_id: "ent-evt-001-step", revision_id: "rev-2" });
  });

  it("ignores teach-back replies that are not corrections", () => {
    const yes: ExpertExchange = { ...scenario.exchanges.find(x => x.exchange_id === "sx-010")!, exchange_id: "sx-yes", answer_lines: [{ text: "Yes, never mind.", at_utc: "2026-10-03T10:13:00.000Z", transcript_line_id: "l" }] };
    const out = synthesize(base({ exchanges: [...scenario.exchanges, yes] }));
    expect(JSON.stringify(out)).not.toContain("sx-yes");
  });

  it("never brings back a revoked entry's words", () => {
    const first = synthesize(base());
    const revoked = { ...byId(first.entries, "ent-evt-001-guardrail"), status: "revoked" as const, revoked_at_utc: "2026-10-03T11:00:00.000Z", revoked_reason: "expert withdrew it" };
    const prior = first.entries.map(e => (e.entry_id === revoked.entry_id ? revoked : e));
    const out = synthesize(base({ prior }));
    const json = JSON.stringify({ ...out, entries: out.entries });
    expect(json).not.toContain("never save FIXTURE decision A");
    expect(out.workflow.steps.map(s => s.entry_id)).not.toContain("ent-evt-001-guardrail");
  });

  it("leaves entries from other modules alone", () => {
    const out = synthesize(base({ prior: [fixtureEntry("ent-step-a")] }));
    expect(out.workflow.steps.map(s => s.entry_id)).not.toContain("ent-step-a");
    expect(out.flagged_for_reconfirmation).toEqual([]);
  });
});
