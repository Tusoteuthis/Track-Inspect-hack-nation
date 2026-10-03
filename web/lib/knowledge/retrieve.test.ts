import { describe, expect, it } from "vitest";
import { fixtureEntry, loadWs5Fixtures } from "@/fixtures/ws5/load";
import { selectEligible, type EligibilityContext } from "./eligibility";
import { IneligibleKnowledgeError, retrieve, tokenize, type RetrievalQuery } from "./retrieve";

const fx = loadWs5Fixtures();
const ctx: EligibilityContext = {
  current_revision_by_entry: fx.current_revision_by_entry,
  exchanges: fx.exchanges,
  events: fx.events,
  allow_fixture: true,
};
const { pinned } = selectEligible(fx.candidates, ctx);

const query = (overrides: Partial<RetrievalQuery> = {}): RetrievalQuery => ({
  decision: null,
  reason: null,
  visual_context: null,
  case_observations: [],
  ...overrides,
});

describe("retrieve", () => {
  it("ranks the entry that shares the learner's terms first among non-guardrails", () => {
    const hits = retrieve({ knowledge: pinned, query: query({ decision: "decision A", reason: "cue D is visible" }), limit: 3 });
    const nonGuardrail = hits.filter(h => !["ent-guardrail-c", "ent-escalate-unclear"].includes(h.entry_id));
    expect(nonGuardrail[0]).toMatchObject({ entry_id: "ent-decision-a", revision_id: "rev-2" });
    expect(nonGuardrail[0].why).toContain("cue");
  });

  it("always includes eligible guardrails and escalation rules, even with no overlap", () => {
    const hits = retrieve({ knowledge: pinned, query: query({ decision: "zzz unrelated" }), limit: 10 });
    expect(hits.map(h => h.entry_id).sort()).toEqual(["ent-escalate-unclear", "ent-guardrail-c"]);
    for (const h of hits) expect(h.why).toContain("always included");
  });

  it("never lets the limit drop a guardrail", () => {
    const hits = retrieve({ knowledge: pinned, query: query({ decision: "decision A cue B upper channel" }), limit: 1 });
    expect(hits.map(h => h.entry_id).sort()).toEqual(["ent-escalate-unclear", "ent-guardrail-c"]);
    const more = retrieve({ knowledge: pinned, query: query({ decision: "decision A cue B upper channel" }), limit: 3 });
    expect(more).toHaveLength(3);
  });

  it("is deterministic and explains every hit", () => {
    const q = query({ visual_context: "upper channel region A", case_observations: ["pattern A", "cue B"] });
    const a = retrieve({ knowledge: pinned, query: q, limit: 4 });
    const b = retrieve({ knowledge: [...pinned].reverse(), query: q, limit: 4 });
    expect(a).toEqual(b);
    for (const h of a) {
      expect(h.why.length).toBeGreaterThan(0);
      expect(h.score).toBeGreaterThanOrEqual(0);
    }
    expect(a.map(h => h.score)).toEqual([...a.map(h => h.score)].sort((x, y) => y - x));
  });

  it("refuses revisions that did not come from selectEligible", () => {
    expect(() => retrieve({ knowledge: [fixtureEntry("ent-step-a")], query: query(), limit: 3 })).toThrow(IneligibleKnowledgeError);
  });

  it.each(["ent-draft-start", "ent-revoked-a", "ent-offrecord-e", "ent-invalid-quote", "ent-unresolved-b"])(
    "refuses ineligible %s, even mixed into a pinned set",
    id => {
      expect(() => retrieve({ knowledge: [...pinned, fixtureEntry(id)], query: query(), limit: 3 })).toThrow(
        IneligibleKnowledgeError
      );
    }
  );

  it("with ctx, refuses pinned knowledge that has since become ineligible", () => {
    const later: EligibilityContext = { ...ctx, current_revision_by_entry: { ...ctx.current_revision_by_entry, "ent-step-a": "rev-2" } };
    expect(() => retrieve({ knowledge: pinned, query: query(), limit: 3, ctx: later })).toThrow(/ent-step-a@rev-1 \(superseded\)/);
    expect(() => retrieve({ knowledge: pinned, query: query(), limit: 3, ctx })).not.toThrow();
  });
});

describe("tokenize", () => {
  it("lowercases, splits on punctuation, drops stop words, keeps unicode letters", () => {
    expect([...tokenize("The Cue-B, ÜBER and 日本 is visible!")].sort()).toEqual(["cue", "visible", "über", "日本"]);
  });
});
