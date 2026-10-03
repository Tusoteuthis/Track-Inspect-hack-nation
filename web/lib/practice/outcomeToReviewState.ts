// The single place where a WS5 evaluation outcome becomes a UI review state.
// UI code never judges correctness; it only renders what this returns.
import type { ReviewStatus } from "@/lib/ui/contracts";

type ReviewedStatus = Extract<ReviewStatus, "review_complete" | "guidance_needed">;

// WS5 outcomes: "ok" | "intervene" | "uncertain" (notes/ws5-sprints/sprint-3-tutor-evaluation.md).
// "uncertain" fails closed until WS5/WS6 agree how an escalated save is shown;
// unknown values also fail closed so a new outcome can never unlock Save.
const COMPLETE_OUTCOMES: ReadonlySet<string> = new Set(["ok"]);

export function outcomeToReviewState(outcome: string): ReviewedStatus {
  return COMPLETE_OUTCOMES.has(outcome) ? "review_complete" : "guidance_needed";
}
