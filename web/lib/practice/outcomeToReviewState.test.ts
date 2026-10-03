import { describe, expect, it } from "vitest";
import { outcomeToReviewState } from "@/lib/practice/outcomeToReviewState";

describe("outcomeToReviewState", () => {
  it.each([
    ["ok", "review_complete"],
    ["intervene", "guidance_needed"],
    // Fails closed until WS5 confirms how uncertain/escalation should be shown.
    ["uncertain", "guidance_needed"],
    ["", "guidance_needed"],
    ["something-new", "guidance_needed"],
    ["OK", "guidance_needed"],
  ] as const)("%j → %s", (outcome, expected) => {
    expect(outcomeToReviewState(outcome)).toBe(expected);
  });
});
