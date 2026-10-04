import { describe, expect, it } from "vitest";
import { assertLearnerCaseView, EvaluatorFieldError } from "../case-view";

const view = {
  case_id: "fx-case-alpha",
  title: "FIXTURE practice trace",
  visible_context: ["FIXTURE pattern A in region A on the upper channel"],
  source: "fixture",
};

describe("assertLearnerCaseView", () => {
  it("accepts a learner-visible view and returns a copy", () => {
    const out = assertLearnerCaseView(view);
    expect(out).toEqual(view);
    expect(out.visible_context).not.toBe(view.visible_context);
  });

  it.each([
    "expected_decision",
    "acceptable_explanations",
    "common_wrong_decision",
    "evaluation_notes",
    "evaluator_notes",
    "answer_key",
    "expected_outcome",
    "correct_answer",
    "scoring_guidance",
  ])("rejects a view carrying the evaluator field %s", field => {
    expect(() => assertLearnerCaseView({ ...view, [field]: "anything" })).toThrow(EvaluatorFieldError);
  });

  it("rejects evaluator fields nested anywhere", () => {
    expect(() => assertLearnerCaseView({ ...view, meta: { evaluator: { notes: "x" } } })).toThrow(EvaluatorFieldError);
  });

  it("rejects any value pointing into evaluator-only paths", () => {
    expect(() =>
      assertLearnerCaseView({ ...view, visible_context: ["see web/.runtime/evaluator/case.json"] })
    ).toThrow(EvaluatorFieldError);
  });

  it("rejects unknown fields instead of passing them to the judge", () => {
    expect(() => assertLearnerCaseView({ ...view, hint: "decision A" })).toThrow(/unexpected field "hint"/);
  });

  it("rejects malformed views", () => {
    expect(() => assertLearnerCaseView({ ...view, visible_context: "text" })).toThrow(/visible_context/);
    expect(() => assertLearnerCaseView({ ...view, case_id: "" })).toThrow(/case_id/);
  });
});
