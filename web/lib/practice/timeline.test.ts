import { describe, expect, it } from "vitest";
import { initialReviewState, reviewMachine } from "@/lib/practice/reviewMachine";
import { nextTimelineEntry } from "@/lib/practice/timeline";
import type { LearnerEvaluation, PracticeTimelineEntry } from "@/lib/ui/contracts";

const AT = "2026-10-04T10:00:00.000Z";
const ev = (draft_revision: number, outcome: string): LearnerEvaluation => ({
  draft_revision,
  knowledge_revision_id: "k",
  outcome,
  message: "",
  guiding_question: null,
  citations: [],
});

describe("nextTimelineEntry", () => {
  it("records proposed → guidance → corrected → saved through a full loop", () => {
    const entries: PracticeTimelineEntry[] = [];
    let s = initialReviewState("k");
    const step = (event: Parameters<typeof reviewMachine>[1]) => {
      const next = reviewMachine(s, event);
      const entry = nextTimelineEntry(s, next, entries, AT);
      if (entry) entries.push(entry);
      s = next;
    };
    step({ type: "REQUEST_REVIEW" });
    step({ type: "EVALUATION_RECEIVED", evaluation: ev(1, "intervene") });
    step({ type: "EDIT" });
    step({ type: "REQUEST_REVIEW" });
    step({ type: "EVALUATION_RECEIVED", evaluation: ev(2, "ok") });
    step({ type: "SAVE_REQUESTED", idempotency_key: "k1" });
    step({ type: "SAVE_ACKED" });
    expect(entries.map(e => [e.kind, e.draft_revision])).toEqual([
      ["proposed", 1],
      ["guidance", 1],
      ["corrected", 2],
      ["saved", 2],
    ]);
  });

  it("does not record saved before the ack", () => {
    const s = { ...initialReviewState("k"), status: "review_complete" as const, evaluation: ev(1, "ok") };
    const saving = reviewMachine(s, { type: "SAVE_REQUESTED", idempotency_key: "x" });
    expect(nextTimelineEntry(s, saving, [], AT)).toBeNull();
  });

  it("a second request before any guidance (e.g. after a failed review) is not a new proposal", () => {
    const prior: PracticeTimelineEntry[] = [{ kind: "proposed", at_utc: AT, draft_revision: 1 }];
    const s = initialReviewState("k");
    expect(nextTimelineEntry(s, reviewMachine(s, { type: "REQUEST_REVIEW" }), prior, AT)).toBeNull();
  });

  it("ignores unchanged states", () => {
    const s = initialReviewState("k");
    expect(nextTimelineEntry(s, s, [], AT)).toBeNull();
  });
});
