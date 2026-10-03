import { describe, expect, it } from "vitest";
import {
  initialReviewState,
  reviewMachine,
  type ReviewEvent,
  type ReviewMachineState,
} from "@/lib/practice/reviewMachine";
import type { LearnerEvaluation, ReviewStatus } from "@/lib/ui/contracts";

const KREV = "k-1";

function evaluation(over: Partial<LearnerEvaluation> = {}): LearnerEvaluation {
  return {
    draft_revision: 1,
    knowledge_revision_id: KREV,
    outcome: "ok",
    message: "m",
    guiding_question: null,
    citations: [],
    ...over,
  };
}

/** Builds a state in `status` at draft revision 1 with consistent fields. */
function at(status: ReviewStatus, over: Partial<ReviewMachineState> = {}): ReviewMachineState {
  const base = initialReviewState(KREV);
  const reviewed = ["guidance_needed", "review_complete", "saving", "save_failed", "saved"].includes(status);
  return {
    ...base,
    status,
    requested_revision: status === "editing_unreviewed" ? null : 1,
    evaluation: reviewed
      ? evaluation({ outcome: status === "guidance_needed" ? "intervene" : "ok" })
      : null,
    idempotency_key: status === "saving" || status === "save_failed" || status === "saved" ? "key-1" : null,
    error: status === "save_failed" ? "boom" : null,
    ...over,
  };
}

const EVENTS = {
  EDIT: { type: "EDIT" },
  REQUEST_REVIEW: { type: "REQUEST_REVIEW" },
  EVAL_OK: { type: "EVALUATION_RECEIVED", evaluation: evaluation() },
  EVAL_INTERVENE: { type: "EVALUATION_RECEIVED", evaluation: evaluation({ outcome: "intervene" }) },
  EVAL_STALE_DRAFT: { type: "EVALUATION_RECEIVED", evaluation: evaluation({ draft_revision: 0 }) },
  EVAL_STALE_KNOWLEDGE: {
    type: "EVALUATION_RECEIVED",
    evaluation: evaluation({ knowledge_revision_id: "k-0" }),
  },
  REVIEW_FAILED: { type: "REVIEW_FAILED", error: "eval down" },
  KNOWLEDGE_CHANGED: { type: "KNOWLEDGE_REVISION_CHANGED", knowledge_revision_id: "k-2" },
  KNOWLEDGE_SAME: { type: "KNOWLEDGE_REVISION_CHANGED", knowledge_revision_id: KREV },
  SAVE_REQUESTED: { type: "SAVE_REQUESTED", idempotency_key: "key-2" },
  SAVE_ACKED: { type: "SAVE_ACKED" },
  SAVE_FAILED: { type: "SAVE_FAILED", error: "commit down" },
  RESET: { type: "RESET" },
} satisfies Record<string, ReviewEvent>;

type EventName = keyof typeof EVENTS;
const STATUSES: ReviewStatus[] = [
  "editing_unreviewed",
  "review_pending",
  "guidance_needed",
  "review_complete",
  "saving",
  "saved",
  "save_failed",
];

// Expected resulting status for every (state × event). "=" means the state is returned unchanged.
const TABLE: Record<ReviewStatus, Record<EventName, ReviewStatus | "=">> = {
  editing_unreviewed: {
    EDIT: "editing_unreviewed",
    REQUEST_REVIEW: "review_pending",
    EVAL_OK: "=",
    EVAL_INTERVENE: "=",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "=",
    KNOWLEDGE_CHANGED: "editing_unreviewed",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "=",
    SAVE_ACKED: "=",
    SAVE_FAILED: "=",
    RESET: "editing_unreviewed",
  },
  review_pending: {
    EDIT: "editing_unreviewed",
    REQUEST_REVIEW: "=",
    EVAL_OK: "review_complete",
    EVAL_INTERVENE: "guidance_needed",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "editing_unreviewed",
    KNOWLEDGE_CHANGED: "editing_unreviewed",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "=",
    SAVE_ACKED: "=",
    SAVE_FAILED: "=",
    RESET: "editing_unreviewed",
  },
  guidance_needed: {
    EDIT: "editing_unreviewed",
    REQUEST_REVIEW: "=",
    EVAL_OK: "=",
    EVAL_INTERVENE: "=",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "=",
    KNOWLEDGE_CHANGED: "editing_unreviewed",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "=",
    SAVE_ACKED: "=",
    SAVE_FAILED: "=",
    RESET: "editing_unreviewed",
  },
  review_complete: {
    EDIT: "editing_unreviewed",
    REQUEST_REVIEW: "=",
    EVAL_OK: "=",
    EVAL_INTERVENE: "=",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "=",
    KNOWLEDGE_CHANGED: "editing_unreviewed",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "saving",
    SAVE_ACKED: "=",
    SAVE_FAILED: "=",
    RESET: "editing_unreviewed",
  },
  saving: {
    EDIT: "=",
    REQUEST_REVIEW: "=",
    EVAL_OK: "=",
    EVAL_INTERVENE: "=",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "=",
    KNOWLEDGE_CHANGED: "editing_unreviewed",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "=",
    SAVE_ACKED: "saved",
    SAVE_FAILED: "save_failed",
    RESET: "=",
  },
  saved: {
    EDIT: "=",
    REQUEST_REVIEW: "=",
    EVAL_OK: "=",
    EVAL_INTERVENE: "=",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "=",
    KNOWLEDGE_CHANGED: "=",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "=",
    SAVE_ACKED: "=",
    SAVE_FAILED: "=",
    RESET: "editing_unreviewed",
  },
  save_failed: {
    EDIT: "editing_unreviewed",
    REQUEST_REVIEW: "=",
    EVAL_OK: "=",
    EVAL_INTERVENE: "=",
    EVAL_STALE_DRAFT: "=",
    EVAL_STALE_KNOWLEDGE: "=",
    REVIEW_FAILED: "=",
    KNOWLEDGE_CHANGED: "editing_unreviewed",
    KNOWLEDGE_SAME: "=",
    SAVE_REQUESTED: "saving",
    SAVE_ACKED: "=",
    SAVE_FAILED: "=",
    RESET: "editing_unreviewed",
  },
};

describe("reviewMachine transition table", () => {
  for (const status of STATUSES) {
    for (const name of Object.keys(EVENTS) as EventName[]) {
      const expected = TABLE[status][name];
      it(`${status} + ${name} → ${expected === "=" ? "(unchanged)" : expected}`, () => {
        const before = at(status);
        const after = reviewMachine(before, EVENTS[name]);
        if (expected === "=") expect(after).toBe(before);
        else expect(after.status).toBe(expected);
      });
    }
  }
});

describe("reviewMachine rules", () => {
  it("starts unreviewed at draft revision 1 with the case knowledge revision", () => {
    const s = initialReviewState(KREV);
    expect(s).toMatchObject({ status: "editing_unreviewed", draft_revision: 1, knowledge_revision_id: KREV });
    expect(s.evaluation).toBeNull();
  });

  it("EDIT bumps the draft revision and clears the evaluation", () => {
    const after = reviewMachine(at("review_complete"), EVENTS.EDIT);
    expect(after.draft_revision).toBe(2);
    expect(after.evaluation).toBeNull();
    expect(after.requested_revision).toBeNull();
  });

  it("EDIT while unreviewed still bumps the revision (each change is a new draft)", () => {
    expect(reviewMachine(at("editing_unreviewed"), EVENTS.EDIT).draft_revision).toBe(2);
  });

  it("REQUEST_REVIEW records which revision is under review", () => {
    const after = reviewMachine(at("editing_unreviewed"), EVENTS.REQUEST_REVIEW);
    expect(after.requested_revision).toBe(1);
    expect(after.error).toBeNull();
  });

  it("a matching evaluation is stored", () => {
    const after = reviewMachine(at("review_pending"), EVENTS.EVAL_INTERVENE);
    expect(after.evaluation?.outcome).toBe("intervene");
  });

  describe("stale evaluations are ignored", () => {
    it("older draft revision", () => {
      const s = at("review_pending");
      expect(reviewMachine(s, EVENTS.EVAL_STALE_DRAFT)).toBe(s);
    });

    it("other knowledge revision", () => {
      const s = at("review_pending");
      expect(reviewMachine(s, EVENTS.EVAL_STALE_KNOWLEDGE)).toBe(s);
    });

    it("evaluation arriving after an edit (request → edit → old result)", () => {
      let s = reviewMachine(at("editing_unreviewed"), EVENTS.REQUEST_REVIEW);
      s = reviewMachine(s, EVENTS.EDIT); // now revision 2, unreviewed
      const late = reviewMachine(s, EVENTS.EVAL_OK); // assessed revision 1
      expect(late).toBe(s);
      expect(late.status).toBe("editing_unreviewed");
    });

    it("evaluation arriving after a re-request for a newer revision", () => {
      let s = reviewMachine(at("editing_unreviewed"), EVENTS.REQUEST_REVIEW);
      s = reviewMachine(s, EVENTS.EDIT);
      s = reviewMachine(s, EVENTS.REQUEST_REVIEW); // pending for revision 2
      const late = reviewMachine(s, EVENTS.EVAL_OK); // for revision 1
      expect(late).toBe(s);
      expect(reviewMachine(s, { type: "EVALUATION_RECEIVED", evaluation: evaluation({ draft_revision: 2 }) }).status).toBe(
        "review_complete"
      );
    });

    it("evaluation arriving after a knowledge change", () => {
      let s = reviewMachine(at("editing_unreviewed"), EVENTS.REQUEST_REVIEW);
      s = reviewMachine(s, EVENTS.KNOWLEDGE_CHANGED);
      expect(reviewMachine(s, EVENTS.EVAL_OK)).toBe(s);
    });

    it("a second evaluation for an already reviewed revision does not overwrite it", () => {
      const s = at("guidance_needed");
      expect(reviewMachine(s, EVENTS.EVAL_OK)).toBe(s);
    });
  });

  it("KNOWLEDGE_REVISION_CHANGED invalidates the review and keys future evaluations on the new id", () => {
    const after = reviewMachine(at("review_complete"), EVENTS.KNOWLEDGE_CHANGED);
    expect(after.knowledge_revision_id).toBe("k-2");
    expect(after.evaluation).toBeNull();
    const pending = reviewMachine(after, EVENTS.REQUEST_REVIEW);
    expect(reviewMachine(pending, EVENTS.EVAL_OK)).toBe(pending); // old knowledge id
    expect(
      reviewMachine(pending, {
        type: "EVALUATION_RECEIVED",
        evaluation: evaluation({ knowledge_revision_id: "k-2" }),
      }).status
    ).toBe("review_complete");
  });

  it("a knowledge change while saving drops the pending save so a late ack cannot mark it saved", () => {
    let s = reviewMachine(at("saving"), EVENTS.KNOWLEDGE_CHANGED);
    s = reviewMachine(s, EVENTS.SAVE_ACKED);
    expect(s.status).toBe("editing_unreviewed");
  });

  it("SAVE_REQUESTED stores the idempotency key; a second request while saving is a no-op", () => {
    const saving = reviewMachine(at("review_complete"), EVENTS.SAVE_REQUESTED);
    expect(saving.idempotency_key).toBe("key-2");
    const again = reviewMachine(saving, { type: "SAVE_REQUESTED", idempotency_key: "key-3" });
    expect(again).toBe(saving);
  });

  it("saved only ever follows SAVE_ACKED from saving", () => {
    for (const status of STATUSES) {
      for (const name of Object.keys(EVENTS) as EventName[]) {
        const after = reviewMachine(at(status), EVENTS[name]);
        if (after.status === "saved" && status !== "saved") {
          expect([status, name]).toEqual(["saving", "SAVE_ACKED"]);
        }
      }
    }
  });

  it("save is unreachable without a matching evaluation that allows it", () => {
    // Walk: request → intervene → save attempt must not save.
    let s = reviewMachine(initialReviewState(KREV), EVENTS.REQUEST_REVIEW);
    s = reviewMachine(s, EVENTS.EVAL_INTERVENE);
    expect(reviewMachine(s, EVENTS.SAVE_REQUESTED)).toBe(s);
  });

  it("SAVE_FAILED keeps the evaluation so a retry saves the same reviewed revision", () => {
    const failed = reviewMachine(at("saving"), EVENTS.SAVE_FAILED);
    expect(failed.error).toBe("commit down");
    expect(failed.evaluation).not.toBeNull();
    const retry = reviewMachine(failed, EVENTS.SAVE_REQUESTED);
    expect(retry.status).toBe("saving");
    expect(retry.error).toBeNull();
  });

  it("REVIEW_FAILED returns to unreviewed with the error, at the same revision", () => {
    const after = reviewMachine(at("review_pending"), EVENTS.REVIEW_FAILED);
    expect(after.error).toBe("eval down");
    expect(after.draft_revision).toBe(1);
    expect(after.requested_revision).toBeNull();
  });

  it("RESET starts a fresh draft at revision 1 with the current knowledge revision", () => {
    const s = reviewMachine(reviewMachine(at("review_complete"), EVENTS.EDIT), EVENTS.RESET);
    expect(s).toEqual(initialReviewState(KREV));
  });
});
