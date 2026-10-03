import { describe, expect, it } from "vitest";
import { practiceContext } from "@/lib/practice/contextMessages";
import type { LearnerEvaluation } from "@/lib/ui/contracts";

describe("practiceContext", () => {
  it("describes a draft edit with the learner's own words and region presence", () => {
    const msg = practiceContext({
      kind: "draft_edited",
      draft: { draft_id: "d", draft_revision: 3, decision: "my call", reason: "because", region: null },
    });
    expect(msg.text).toContain("[PRACTICE draft_edited draft_rev=3]");
    expect(msg.text).toContain('decision: "my call"');
    expect(msg.text).toContain("region: none");
  });

  it("passes only outcome, guiding question and cited quotes for an evaluation", () => {
    const ev: LearnerEvaluation = {
      draft_revision: 2,
      knowledge_revision_id: "k",
      outcome: "intervene",
      message: "long tutor message",
      guiding_question: "What would you check?",
      citations: [{ entry_id: "e", revision_id: "r", quote: { exchange_id: "x", text: "Expert words" }, evidence: null }],
    };
    const msg = practiceContext({ kind: "evaluation_received", evaluation: ev });
    expect(msg.text).toContain("outcome=intervene");
    expect(msg.text).toContain("What would you check?");
    expect(msg.text).toContain('"Expert words"');
    expect(msg.text).not.toContain("long tutor message");
  });

  it("gives each update a unique context id so updates never supersede each other", () => {
    const a = practiceContext({ kind: "review_requested", draft_revision: 1 });
    const b = practiceContext({ kind: "review_requested", draft_revision: 1 });
    expect(a.contextId).not.toBe(b.contextId);
  });

  it("describes screen frames by reference only", () => {
    const msg = practiceContext({
      kind: "screen_frame",
      frame: { frame_id: "f1", captured_at_utc: "t", draft_revision: 4, source: "fixture" },
    });
    expect(msg.text).toBe("[PRACTICE screen_frame frame=f1 draft_rev=4 captured=t]");
  });
});
