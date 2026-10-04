import { describe, expect, it } from "vitest";
import { selectEligible } from "../eligibility";
import {
  DEFAULT_MISSING_CONTEXT,
  FALLBACK_EXPLANATION,
  FALLBACK_QUESTION,
  guardVerdict,
  quotedSpans,
  verbatimExchangeIds,
} from "../output-guard";
import { JudgeError, type JudgeVerdict } from "../evaluation-types";
import { ctx, DECISION_QUOTE, eligibleCandidates, ESCALATION_QUOTE, fx, GUARDRAIL_QUOTE, verdict } from "./helpers";

const { pinned } = selectEligible(eligibleCandidates, ctx);
const guard = (v: JudgeVerdict, shown = pinned) => guardVerdict(v, shown, fx.exchanges);

describe("guardVerdict — citations", () => {
  it("keeps a verbatim citation of a pinned revision and resolves revision and exchange", () => {
    const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE }] }));
    expect(g.outcome).toBe("intervene");
    expect(g.cited).toEqual([{ entry_id: "ent-guardrail-c", revision_id: "rev-1", exchange_ids: ["exc-003"], quote: GUARDRAIL_QUOTE }]);
    expect(g.notes).toEqual([]);
  });

  it("accepts a verbatim sub-span of the expert's words", () => {
    const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote: "never save FIXTURE decision A" }] }));
    expect(g.cited).toHaveLength(1);
  });

  it("rejects a non-verbatim quote (any change in case, punctuation or wording)", () => {
    for (const quote of [
      "Never save FIXTURE decision A when FIXTURE condition C is present on the second channel.",
      "never save decision A when condition C is present",
      "do not save FIXTURE decision A",
    ]) {
      const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote }] }));
      expect(g.cited).toEqual([]);
      expect(g.notes.join()).toMatch(/not verbatim/);
    }
  });

  it("rejects a quote that is verbatim in a different entry than the one cited", () => {
    const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-step-a", quote: GUARDRAIL_QUOTE }] }));
    expect(g.cited).toEqual([]);
  });

  it("rejects citations of entries that are not pinned (revoked, unresolved, unknown)", () => {
    for (const entry_id of ["ent-revoked-a", "ent-unresolved-b", "ent-made-up"]) {
      const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id, quote: "I choose FIXTURE decision A" }] }));
      expect(g.cited).toEqual([]);
      expect(g.notes.join()).toMatch(/not in the pinned knowledge/);
    }
  });

  it("rejects quotes too short to carry reasoning", () => {
    const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote: "never save" }] }));
    expect(g.cited).toEqual([]);
  });

  it("checks the quote against the answer line, not only the stored entry", () => {
    const tampered = fx.exchanges.map(x =>
      x.exchange_id === "exc-003" ? { ...x, answer_lines: [{ ...x.answer_lines[0], text: "something else entirely" }] } : x
    );
    const entry = pinned.find(e => e.entry_id === "ent-guardrail-c")!;
    expect(verbatimExchangeIds(entry, GUARDRAIL_QUOTE, tampered)).toEqual([]);
    expect(verbatimExchangeIds(entry, GUARDRAIL_QUOTE, fx.exchanges)).toEqual(["exc-003"]);
  });

  it("deduplicates repeated citations", () => {
    const c = { entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE };
    expect(guard(verdict({ outcome: "intervene", citations: [c, c] })).cited).toHaveLength(1);
  });

  it("throws on an unknown outcome", () => {
    expect(() => guard({ ...verdict(), outcome: "block" as never })).toThrow(JudgeError);
  });
});

describe("guardVerdict — downgrades", () => {
  it("downgrades intervene without a valid citation to uncertain, with a context request", () => {
    const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote: "an invented rule about decision A" }] }));
    expect(g.outcome).toBe("uncertain");
    expect(g.notes.join()).toMatch(/downgraded intervene to uncertain/);
    expect(g.missing_context).toBe(DEFAULT_MISSING_CONTEXT);
  });

  it("downgrades ok without a valid citation to uncertain", () => {
    const g = guard(verdict({ outcome: "ok", citations: [] }));
    expect(g.outcome).toBe("uncertain");
  });
});

describe("guardVerdict — tutor wording", () => {
  it("replaces an explanation that quotes uncited text", () => {
    const g = guard(
      verdict({
        outcome: "intervene",
        citations: [{ entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE }],
        explanation: 'The expert also said "always save decision A on Fridays".',
      })
    );
    expect(g.explanation).toBe(FALLBACK_EXPLANATION);
    expect(g.notes.join()).toMatch(/explanation: it quoted uncited text/);
  });

  it("keeps an explanation that quotes only cited text, including curly quotes", () => {
    const explanation = "Check the second channel first: “never save FIXTURE decision A”.";
    const g = guard(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE }], explanation }));
    expect(g.explanation).toBe(explanation);
  });

  it("replaces a guiding question that quotes uncited text, and adds one when missing", () => {
    const cited = [{ entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE }];
    expect(guard(verdict({ outcome: "intervene", citations: cited, guiding_question: 'Is "decision Q" right?' })).guiding_question).toBe(FALLBACK_QUESTION);
    expect(guard(verdict({ outcome: "intervene", citations: cited, guiding_question: "  " })).guiding_question).toBe(FALLBACK_QUESTION);
  });

  it("finds quoted spans in straight, curly and guillemet quotes", () => {
    expect(quotedSpans('a "b c" d “e f” «g»')).toEqual(["b c", "e f", "g"]);
    expect(quotedSpans("the expert's view")).toEqual([]);
  });
});

describe("guardVerdict — uncertain and escalation", () => {
  it("keeps a pinned escalation rule for uncertain and cites its words", () => {
    const g = guard(verdict({ outcome: "uncertain", escalation_entry_id: "ent-escalate-unclear" }));
    expect(g.outcome).toBe("uncertain");
    expect(g.escalation).toEqual({ entry_id: "ent-escalate-unclear", revision_id: "rev-1" });
    expect(g.cited.map(c => c.quote)).toEqual([ESCALATION_QUOTE]);
    expect(g.missing_context).toBeNull();
  });

  it("drops an escalation that is not a pinned escalation rule", () => {
    const g = guard(verdict({ outcome: "uncertain", escalation_entry_id: "ent-guardrail-c" }));
    expect(g.escalation).toBeNull();
    expect(g.missing_context).toBe(DEFAULT_MISSING_CONTEXT);
  });

  it("uncertain without escalation always asks for missing context (never invents a rule)", () => {
    const g = guard(verdict({ outcome: "uncertain", missing_context: null }));
    expect(g.escalation).toBeNull();
    expect(g.missing_context).toBe(DEFAULT_MISSING_CONTEXT);
    expect(g.cited).toEqual([]);
  });

  it("drops an escalation attached to a non-uncertain outcome", () => {
    const g = guard(
      verdict({ outcome: "ok", citations: [{ entry_id: "ent-decision-a", quote: DECISION_QUOTE }], escalation_entry_id: "ent-escalate-unclear" })
    );
    expect(g.outcome).toBe("ok");
    expect(g.escalation).toBeNull();
  });
});
