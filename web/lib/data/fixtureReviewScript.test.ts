import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewScript } from "@/lib/data/fixtureReviewScript";
import type { SourceUpdate } from "@/lib/data/source";
import type { ReviewMark } from "@/lib/ui/contracts";

const SESSION = "fixture-session-001";

describe("fixture review script", () => {
  it("starts at Revision 1 with no previous revision and no confirmation", async () => {
    const s = createReviewScript();
    const review = await s.getReview(SESSION);
    expect(review.source).toBe("fixture");
    expect(review.current.revision_label).toBe("Revision 1");
    expect(review.previous).toBeNull();
    expect(review.confirmations).toEqual([]);
    expect((await s.getWorkMap(SESSION)).revision_id).toBe(review.current.revision_id);
  });

  it("walks rev-1 → correction → rev-2 → confirmed and pushes each stage", async () => {
    const s = createReviewScript();
    const updates: SourceUpdate[] = [];
    const unsubscribe = s.subscribe(SESSION, u => updates.push(u));

    expect(s.controls.advance()).toBe(true);
    let review = await s.getReview(SESSION);
    expect(review.current.revision_label).toBe("Revision 1");
    expect(review.confirmations.map(c => [c.revision_id, c.status])).toEqual([["fixture-rev-1", "corrected"]]);

    s.controls.advance();
    review = await s.getReview(SESSION);
    expect(review.current.revision_label).toBe("Revision 2");
    expect(review.current.parent_revision_id).toBe("fixture-rev-1");
    expect(review.previous?.revision_id).toBe("fixture-rev-1");
    expect(review.current.steps.every(st => st.status !== "confirmed")).toBe(true);

    s.controls.advance();
    review = await s.getReview(SESSION);
    expect(review.confirmations.at(-1)).toMatchObject({ revision_id: "fixture-rev-2", status: "confirmed" });
    expect(review.current.steps.filter(st => st.status === "confirmed").length).toBeGreaterThan(0);
    expect(review.current.steps.find(st => st.kind === "exception")?.status).toBe("unresolved");

    expect(s.controls.advance()).toBe(false);
    expect(updates.filter(u => u.type === "review")).toHaveLength(3);
    expect(updates.filter(u => u.type === "workmap")).toHaveLength(3);
    unsubscribe();
    s.controls.reset();
    expect(updates).toHaveLength(6);
    expect((await s.getReview(SESSION)).current.revision_label).toBe("Revision 1");
  });

  it("answers the correction's open question from the correction stage on", async () => {
    const s = createReviewScript();
    const answered = async () => (await s.getReview(SESSION)).open_questions.map(q => q.answered_by_exchange_id !== null);
    expect(await answered()).toEqual([false, false, true]);
    s.controls.advance();
    expect(await answered()).toEqual([true, false, true]);
  });

  it("only notifies listeners of the same session and returns copies", async () => {
    const s = createReviewScript();
    const other = vi.fn();
    s.subscribe("another-session", other);
    s.controls.advance();
    expect(other).not.toHaveBeenCalled();
    const a = await s.getReview(SESSION);
    a.current.steps[0].title = "mutated";
    expect((await s.getReview(SESSION)).current.steps[0].title).not.toBe("mutated");
  });

  it("rejects unknown sessions", async () => {
    const s = createReviewScript();
    await expect(s.getReview("nope")).rejects.toThrow(/unknown session/i);
  });

  describe("review marks", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const mark = (revision_id: string): ReviewMark => ({
      session_id: SESSION,
      entry_id: "fixture-entry-002",
      revision_id,
      kind: "correction_requested",
    });

    it("acknowledges only after the latency", async () => {
      const s = createReviewScript({ markLatencyMs: 500 });
      let result: unknown;
      void s.submitReviewMark(mark("fixture-rev-1")).then(r => (result = r));
      await vi.advanceTimersByTimeAsync(499);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toMatchObject({ status: "acknowledged" });
    });

    it("fails when failures are simulated or the revision is no longer under review", async () => {
      const s = createReviewScript({ markLatencyMs: 0 });
      s.controls.setFailMarks(true);
      const p1 = s.submitReviewMark(mark("fixture-rev-1"));
      await vi.runAllTimersAsync();
      expect(await p1).toMatchObject({ status: "failed" });
      s.controls.setFailMarks(false);
      const p2 = s.submitReviewMark(mark("fixture-rev-0"));
      await vi.runAllTimersAsync();
      expect(await p2).toMatchObject({ status: "failed", error: expect.stringMatching(/no longer under review/) });
    });
  });
});
