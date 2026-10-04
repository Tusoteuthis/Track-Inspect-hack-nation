import { describe, expect, it } from "vitest";
import { loadDraftFixtures, type DraftFixture } from "@/fixtures/ws5/drafts/load";
import { EvaluatorFieldError } from "../case-view";
import { evaluate } from "../evaluate";
import { JudgeError, type JudgeVerdict } from "../evaluation-types";
import { IneligibleKnowledgeError } from "../retrieve";
import {
  DECISION_QUOTE,
  eligibleCandidates,
  ESCALATION_QUOTE,
  fx,
  GUARDRAIL_QUOTE,
  knowledge,
  scriptedJudge,
  verdict,
} from "./helpers";

const drafts = loadDraftFixtures();
const byId = (id: string): DraftFixture => drafts.find(d => d.draft_id === id)!;
const input = (d: DraftFixture, k = knowledge()) => ({ draft: d.draft, case_view: d.case_view, knowledge: k });

// What a well-behaved judge would answer per fixture class. The pipeline's guards decide what
// survives; the LLM-backed harness (run-eval.mts) checks the real judge against the same labels.
const SCRIPT: Record<string, JudgeVerdict> = {
  "d01-consistent": verdict({
    outcome: "ok",
    citations: [{ entry_id: "ent-decision-a", quote: DECISION_QUOTE }],
    guiding_question: "Which cues did you check before choosing decision A?",
    explanation: "Your reason names both cues the expert requires and you checked the second channel.",
  }),
  "d02-guardrail-violation": verdict({
    outcome: "intervene",
    citations: [{ entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE }],
    guiding_question: "What do you notice on the second channel compared with the upper channel?",
    explanation: "The second channel shows the condition the expert said rules out saving this decision.",
  }),
  "d03-uncovered": verdict({
    outcome: "uncertain",
    guiding_question: "What do you see on the third channel that the expert ever described?",
    uncertainty: "The expert never described pattern Z or a third channel.",
    missing_context: "Describe the third channel to a senior engineer before saving.",
  }),
  "d04-relies-on-revoked": verdict({
    outcome: "intervene",
    citations: [{ entry_id: "ent-decision-a", quote: DECISION_QUOTE }],
    guiding_question: "Which cues does the expert need to see before choosing decision A?",
    explanation: "Neither cue is visible here.",
  }),
  "d05-relies-on-unresolved": verdict({
    outcome: "uncertain",
    guiding_question: "Has the expert told us what region B means?",
    uncertainty: "There is no confirmed knowledge about region B.",
    escalation_entry_id: "ent-escalate-unclear",
  }),
  "d06-right-decision-bad-reason": verdict({
    outcome: "intervene",
    citations: [{ entry_id: "ent-decision-a", quote: DECISION_QUOTE }],
    guiding_question: "Your decision may be right — but what does the expert check before choosing it?",
    explanation: "Your reason skips the cues the expert requires.",
  }),
};

describe("evaluate — input guard", () => {
  it("throws on knowledge that is not teachable, before calling the judge", async () => {
    const judge = scriptedJudge(verdict());
    await expect(evaluate(input(byId("d02-guardrail-violation"), knowledge(fx.candidates)), judge)).rejects.toThrow(IneligibleKnowledgeError);
    expect(judge.inputs).toHaveLength(0);
  });

  it.each(["ent-revoked-a", "ent-unresolved-b", "ent-draft-start", "ent-offrecord-e", "ent-invalid-quote"])(
    "throws when %s is slipped into the knowledge",
    async id => {
      const extra = fx.candidates.find(c => c.entry.entry_id === id)!;
      const judge = scriptedJudge(verdict());
      await expect(evaluate(input(byId("d01-consistent"), knowledge([...eligibleCandidates, extra])), judge)).rejects.toThrow(
        IneligibleKnowledgeError
      );
      expect(judge.inputs).toHaveLength(0);
    }
  );

  it("throws when the case view carries evaluator fields, before calling the judge", async () => {
    const d = byId("d02-guardrail-violation");
    const judge = scriptedJudge(verdict());
    const leaky = { ...d.case_view, expected_decision: "not decision A" };
    await expect(evaluate({ draft: d.draft, case_view: leaky, knowledge: knowledge() }, judge)).rejects.toThrow(EvaluatorFieldError);
    expect(judge.inputs).toHaveLength(0);
  });

  it("rejects malformed drafts", async () => {
    const d = byId("d01-consistent");
    await expect(evaluate({ ...input(d), draft: { ...d.draft, draft_rev: 0 } }, scriptedJudge(verdict()))).rejects.toThrow(/draft_rev/);
  });

  it("wraps judge failures in JudgeError (WS6 records a failed evaluation, which never permits a commit)", async () => {
    const judge = { name: "broken", judge: async () => Promise.reject(new Error("network down")) };
    await expect(evaluate(input(byId("d01-consistent")), judge)).rejects.toThrow(JudgeError);
  });
});

describe("evaluate — what the judge sees", () => {
  it("only retrieved eligible entries, the visible case and the draft — no case id or title", async () => {
    const d = byId("d02-guardrail-violation");
    const judge = scriptedJudge(SCRIPT[d.draft_id]);
    await evaluate(input(d), judge);
    const seen = JSON.stringify(judge.inputs[0]);
    expect(seen).not.toContain(d.case_view.case_id);
    expect(seen).not.toContain(d.case_view.title!);
    for (const id of ["ent-revoked-a", "ent-unresolved-b", "ent-draft-start", "ent-offrecord-e", "ent-invalid-quote"]) {
      expect(seen).not.toContain(id);
    }
    // Words that exist only in ineligible entries never reach the judge.
    expect(seen).not.toContain("I am not sure yet what it means");
    expect(seen).not.toContain("off-record remark");
    expect(seen).not.toContain("words the expert never said");
    expect(judge.inputs[0].knowledge.map(k => k.entry_id)).toEqual(expect.arrayContaining(["ent-guardrail-c", "ent-escalate-unclear"]));
  });

  it("labels AI wording apart from the expert's quotes", async () => {
    const judge = scriptedJudge(SCRIPT["d02-guardrail-violation"]);
    await evaluate(input(byId("d02-guardrail-violation")), judge);
    const guardrail = judge.inputs[0].knowledge.find(k => k.entry_id === "ent-guardrail-c")!;
    expect(guardrail.expert_quotes).toContain(GUARDRAIL_QUOTE);
    expect(guardrail.process_summary).toMatch(/^FIXTURE guardrail/);
  });
});

describe("evaluate — fixture draft classes (mocked judge)", () => {
  it.each(drafts.map(d => [d.draft_id, d] as const))("%s matches its label", async (_id, d) => {
    const result = await evaluate(input(d), scriptedJudge(SCRIPT[d.draft_id]));
    expect(result.outcome).toBe(d.label.outcome);
    const citedIds = result.cited.map(c => c.entry_id);
    if (d.label.must_cite_any) expect(citedIds.some(id => d.label.must_cite_any!.includes(id))).toBe(true);
    for (const id of d.label.never_cite) expect(citedIds).not.toContain(id);
    if (d.label.uncertain_requires) expect(result.escalation !== null || /context|senior|describe/i.test(result.feedback_text)).toBe(true);
    expect(result.guard_notes).toEqual([]);
    expect(result.produced_by).toEqual({ module: "ws5-tutor", version: expect.any(String), judge: "mock" });
  });

  it("a guardrail violation is caught with the guiding question first, the expert's exact words and the evidence", async () => {
    const r = await evaluate(input(byId("d02-guardrail-violation")), scriptedJudge(SCRIPT["d02-guardrail-violation"]));
    expect(r.outcome).toBe("intervene");
    expect(r.feedback_text.startsWith(r.guiding_question)).toBe(true);
    expect(r.feedback_text).toContain(`Guardrail — the expert said: "${GUARDRAIL_QUOTE}"`);
    expect(r.feedback_text).toContain("exchange exc-003");
    expect(r.evidence).toEqual([
      expect.objectContaining({ entry_id: "ent-guardrail-c", event_id: "evt-002", highlighted_image_ref: expect.stringMatching(/highlight/) }),
    ]);
    expect(r.feedback_text).toContain("event evt-002");
    expect(r.feedback_text.indexOf(r.guiding_question)).toBeLessThan(r.feedback_text.indexOf(GUARDRAIL_QUOTE));
  });

  it("an escalation rule is delivered in the expert's words", async () => {
    const r = await evaluate(input(byId("d05-relies-on-unresolved")), scriptedJudge(SCRIPT["d05-relies-on-unresolved"]));
    expect(r.escalation).toEqual({ entry_id: "ent-escalate-unclear", revision_id: "rev-1" });
    expect(r.feedback_text).toContain(ESCALATION_QUOTE);
  });

  it("a judge that cites a revoked entry for a wrong draft ends uncertain, never citing it", async () => {
    const r = await evaluate(
      input(byId("d04-relies-on-revoked")),
      scriptedJudge(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-revoked-a", quote: "I choose FIXTURE decision A" }] }))
    );
    expect(r.outcome).toBe("uncertain");
    expect(r.cited).toEqual([]);
    expect(r.feedback_text).not.toContain("I choose FIXTURE decision A");
  });

  it("a judge that invents a rule is not believed", async () => {
    const r = await evaluate(
      input(byId("d03-uncovered")),
      scriptedJudge(
        verdict({
          outcome: "intervene",
          citations: [{ entry_id: "ent-guardrail-c", quote: "never save FIXTURE decision Z on the third channel" }],
          explanation: 'The expert said "never save FIXTURE decision Z".',
        })
      )
    );
    expect(r.outcome).toBe("uncertain");
    expect(r.feedback_text).not.toContain("decision Z on the third channel");
    expect(r.feedback_text).not.toContain('"never save FIXTURE decision Z"');
    expect(r.guard_notes.length).toBeGreaterThan(0);
  });
});
