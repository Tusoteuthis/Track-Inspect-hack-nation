import { describe, expect, it } from "vitest";
import { initialReviewState, reviewReducer, type ReviewState } from "@/lib/review/reviewState";
import type { ExpertConfirmation } from "@/lib/expert/contracts";
import type { ReviewView, WorkMapView } from "@/lib/ui/contracts";

const view = (revision_id: string, label: string, confirmations: number = 0, session_id = "s1"): ReviewView =>
  ({
    session_id,
    current: { revision_id, revision_label: label } as WorkMapView,
    previous: null,
    open_questions: [],
    confirmations: Array.from({ length: confirmations }, () => ({}) as ExpertConfirmation),
    source: "fixture",
  }) as ReviewView;

const ready = (review: ReviewView): ReviewState => reviewReducer(initialReviewState("s1"), { type: "loaded", review });

describe("reviewReducer", () => {
  it("loads and fails", () => {
    expect(initialReviewState("s1").status).toBe("loading");
    expect(ready(view("r1", "Revision 1"))).toMatchObject({ status: "ready", notice: null });
    expect(reviewReducer(initialReviewState("s1"), { type: "load_failed", error: "x" })).toMatchObject({ status: "error", error: "x" });
  });

  it("announces a new revision by label", () => {
    const next = reviewReducer(ready(view("r1", "Revision 1")), { type: "update", update: { type: "review", review: view("r2", "Revision 2") } });
    expect(next).toMatchObject({ status: "ready", notice: { kind: "new_revision", label: "Revision 2" } });
    if (next.status === "ready") expect(next.review.current.revision_id).toBe("r2");
  });

  it("announces a new confirmation on the same revision", () => {
    const next = reviewReducer(ready(view("r2", "Revision 2")), { type: "update", update: { type: "review", review: view("r2", "Revision 2", 1) } });
    expect(next).toMatchObject({ notice: { kind: "confirmation", label: "Revision 2" } });
  });

  it("marks other changes as updated", () => {
    const next = reviewReducer(ready(view("r2", "Revision 2")), { type: "update", update: { type: "review", review: view("r2", "Revision 2") } });
    expect(next).toMatchObject({ notice: { kind: "updated" } });
  });

  it("ignores other sessions and non-review updates", () => {
    const state = ready(view("r1", "Revision 1"));
    expect(reviewReducer(state, { type: "update", update: { type: "review", review: view("r9", "Revision 9", 0, "s2") } })).toBe(state);
    expect(reviewReducer(state, { type: "update", update: { type: "workmap", workmap: {} as WorkMapView } })).toBe(state);
  });

  it("an update arriving before the load result counts as loaded", () => {
    const next = reviewReducer(initialReviewState("s1"), { type: "update", update: { type: "review", review: view("r2", "Revision 2") } });
    expect(next).toMatchObject({ status: "ready", notice: null });
  });

  it("a late load result does not overwrite a pushed newer state", () => {
    const pushed = reviewReducer(ready(view("r1", "Revision 1")), { type: "update", update: { type: "review", review: view("r2", "Revision 2") } });
    expect(reviewReducer(pushed, { type: "loaded", review: view("r1", "Revision 1") })).toBe(pushed);
  });
});
