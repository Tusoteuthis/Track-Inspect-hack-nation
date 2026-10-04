import { describe, expect, it } from "vitest";
import { DEFAULT_INTERVIEW_CONFIG, withConfig } from "./interview-config";

describe("interview config", () => {
  it("has the sprint defaults", () => {
    expect(DEFAULT_INTERVIEW_CONFIG).toMatchObject({
      dedup_min_iou: 0.5,
      stale_after_ms: 30_000,
      pause_ms: 1200,
      // Sprint 5 budgets (strategy §6, D1–D7)
      budget_max_questions: 5,
      topic_max_followups: 1,
      orient_max_questions: 2,
      debrief_max_gaps: 3,
      teach_back_max_corrections: 1,
    });
    expect(DEFAULT_INTERVIEW_CONFIG).not.toHaveProperty("budget_window_ms");
    expect(DEFAULT_INTERVIEW_CONFIG.budget_max_questions).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_INTERVIEW_CONFIG.budget_max_questions).toBeLessThanOrEqual(5);
  });

  it("overrides only the given fields and ignores invalid values", () => {
    const c = withConfig({ pause_ms: 1500, stale_after_ms: Number.NaN, budget_max_questions: -2 });
    expect(c.pause_ms).toBe(1500);
    expect(c.stale_after_ms).toBe(DEFAULT_INTERVIEW_CONFIG.stale_after_ms);
    expect(c.budget_max_questions).toBe(DEFAULT_INTERVIEW_CONFIG.budget_max_questions);
  });
});
