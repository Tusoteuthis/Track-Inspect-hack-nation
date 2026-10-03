import { describe, expect, it } from "vitest";
import { fixtureEntry, loadWs5Fixtures } from "@/fixtures/ws5/load";
import {
  assertQuotesVerbatim,
  findNonVerbatimQuotes,
  QuoteNotVerbatimError,
  validateEntry,
  type KnowledgeEntryContent,
  type ViolationCode,
} from "./schema";

const fx = loadWs5Fixtures();
const ctx = { exchanges: fx.exchanges, events: fx.events };

function codesFor(input: unknown, withCtx = true): ViolationCode[] {
  const result = validateEntry(input, withCtx ? ctx : {});
  return result.ok ? [] : result.violations.map(v => v.code);
}

const confirmedStep = (): KnowledgeEntryContent => structuredClone(fixtureEntry("ent-step-a"));

describe("fixture entries", () => {
  const valid = fx.candidates.filter(c => c.entry.entry_id !== "ent-invalid-quote");

  it.each(valid.map(c => [c.path, c.entry] as const))("%s satisfies every invariant", (_path, entry) => {
    expect(codesFor(entry)).toEqual([]);
  });

  it("are all labelled as fixtures from fixture-session-001", () => {
    for (const c of fx.candidates) expect(c.entry.source).toBe("fixture");
    for (const x of fx.exchanges) {
      expect(x.source).toBe("fixture");
      expect(x.session_id).toBe("fixture-session-001");
      for (const line of x.answer_lines) expect(line.text).toContain("FIXTURE");
    }
  });

  it("the invalid fixture is flagged for its non-verbatim quote", () => {
    expect(codesFor(fixtureEntry("ent-invalid-quote"))).toEqual(["quote_not_verbatim"]);
  });
});

describe("evidence invariants", () => {
  it("flags a step without visual evidence instead of filling it", () => {
    const e = confirmedStep();
    e.visual_evidence = [];
    expect(codesFor(e)).toEqual(["missing_visual_evidence"]);
    expect(e.visual_evidence).toEqual([]);
  });

  it("flags a step without an expert quote", () => {
    const e = confirmedStep();
    e.expert_words = [];
    e.interpretation = [];
    e.qualifiers = [];
    expect(codesFor(e)).toEqual(["missing_expert_quote"]);
  });

  it("applies to every kind, including guardrails and escalation rules", () => {
    for (const id of ["ent-guardrail-c", "ent-escalate-unclear"]) {
      const e = structuredClone(fixtureEntry(id));
      e.visual_evidence = [];
      e.expert_words = [];
      expect(codesFor(e, false)).toEqual(["missing_visual_evidence", "missing_expert_quote"]);
    }
  });

  it("reports all violations together, not just the first", () => {
    const e = confirmedStep();
    e.visual_evidence = [];
    e.expert_words = [];
    e.confirmation = null;
    e.revoked_reason = "stray";
    expect(codesFor(e, false)).toEqual([
      "missing_visual_evidence",
      "missing_expert_quote",
      "confirmed_without_confirmation",
      "non_revoked_has_revoked_fields",
    ]);
  });

  it("flags unknown exchanges and events when the linked records are given", () => {
    const e = confirmedStep();
    e.expert_words[0] = { exchange_id: "exc-missing", quote: "x" };
    e.visual_evidence[0] = { ...e.visual_evidence[0], event_id: "evt-missing" };
    e.confirmation = { ...e.confirmation!, expert_response_exchange_id: "exc-gone" };
    expect(codesFor(e)).toEqual(["unknown_exchange", "unknown_exchange", "unknown_event"]);
  });

  it("flags absolute image links", () => {
    const e = confirmedStep();
    e.visual_evidence[0] = { ...e.visual_evidence[0], image_ref: "/fixtures/trace-a-full.svg", highlighted_image_ref: "https://x/y.png" };
    expect(codesFor(e)).toEqual(["absolute_image_ref", "absolute_image_ref"]);
  });

  it("keeps session time and signal time independent; both may be null", () => {
    const e = confirmedStep();
    e.visual_evidence[0] = { ...e.visual_evidence[0], session_time_ms: null, signal_interval: null };
    expect(codesFor(e)).toEqual([]);
    e.visual_evidence[0] = { ...e.visual_evidence[0], session_time_ms: 5000, signal_interval: { start: 2, end: 3, unit: "m" } };
    expect(codesFor(e)).toEqual([]);
  });

  it("requires preserved qualifiers to appear in the expert's quotes", () => {
    const e = confirmedStep();
    e.qualifiers = ["usually", "always"];
    expect(codesFor(e)).toEqual(["qualifier_not_in_quotes"]);
  });
});

describe("verbatim quotes", () => {
  it("accepts exact spans of one answer line", () => {
    expect(findNonVerbatimQuotes(confirmedStep(), fx.exchanges)).toEqual([]);
    expect(() => assertQuotesVerbatim(confirmedStep(), fx.exchanges)).not.toThrow();
  });

  it("rejects a quote whose qualifier was dropped", () => {
    const e = confirmedStep();
    e.expert_words[0] = { exchange_id: "exc-001", quote: "This shows FIXTURE pattern A." };
    expect(findNonVerbatimQuotes(e, fx.exchanges).map(v => v.path)).toEqual(["expert_words[0]"]);
  });

  it("rejects case or punctuation changes and quotes attributed to the wrong exchange", () => {
    const e = confirmedStep();
    e.interpretation[0] = { type: "expert_quote", exchange_id: "exc-001", quote: "Usually shows FIXTURE pattern A" };
    e.expert_words[1] = { exchange_id: "exc-001", quote: "first I look at the upper channel" };
    expect(findNonVerbatimQuotes(e, fx.exchanges).map(v => v.path)).toEqual(["expert_words[1]", "interpretation[0]"]);
  });

  it("checks quotes inside exceptions and rejects spans across two answer lines", () => {
    const e = structuredClone(fixtureEntry("ent-guardrail-c"));
    e.exceptions[0].action = { type: "expert_quote", exchange_id: "exc-001", quote: "region A. This usually" };
    const err = (() => {
      try {
        assertQuotesVerbatim(e, fx.exchanges);
      } catch (error) {
        return error;
      }
    })();
    expect(err).toBeInstanceOf(QuoteNotVerbatimError);
    expect((err as QuoteNotVerbatimError).violations.map(v => v.path)).toEqual(["exceptions[0].action"]);
  });
});

describe("status-bound invariants", () => {
  it("confirmed requires confirmation evidence", () => {
    const e = confirmedStep();
    e.confirmation = null;
    expect(codesFor(e)).toEqual(["confirmed_without_confirmation"]);
  });

  it("confirmation must bind to this exact revision", () => {
    const e = confirmedStep();
    e.revision_id = "rev-2";
    expect(codesFor(e)).toEqual(["confirmation_revision_mismatch"]);
  });

  it("confirmed requires a confirmed result", () => {
    const e = confirmedStep();
    e.confirmation = { ...e.confirmation!, result: "corrected" };
    expect(codesFor(e)).toEqual(["confirmation_result_mismatch"]);
  });

  it("revoked entries keep content but need revoked_at_utc and revoked_reason", () => {
    const revoked = fixtureEntry("ent-revoked-a");
    expect(revoked.expert_words.length).toBeGreaterThan(0);
    expect(codesFor(revoked)).toEqual([]);
    const e = structuredClone(revoked);
    e.revoked_reason = null;
    expect(codesFor(e)).toEqual(["revoked_missing_fields"]);
  });
});

describe("shape", () => {
  it("rejects non-objects and reports every shape problem", () => {
    expect(codesFor(null)).toEqual(["invalid_shape"]);
    const e = { ...confirmedStep(), schema_version: "ws5.v9", status: "approved", kind: "label", workflow_step: { type: "summary" } };
    const result = validateEntry(e);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.map(v => v.path)).toEqual(["schema_version", "status", "kind", "workflow_step.type"]);
    }
  });

  it("requires signal_interval to be present, even when null", () => {
    const e = confirmedStep() as unknown as { visual_evidence: Record<string, unknown>[] };
    delete e.visual_evidence[0].signal_interval;
    expect(codesFor(e)).toEqual(["invalid_shape"]);
  });
});
