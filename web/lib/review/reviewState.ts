// Review screen state: the loaded review plus a notice describing the most
// recent pushed change, so the screen can announce it.
import type { SourceUpdate } from "@/lib/data/source";
import type { ReviewView } from "@/lib/ui/contracts";

export type ReviewNotice =
  | { kind: "new_revision"; label: string }
  | { kind: "confirmation"; label: string }
  | { kind: "updated" };

export type ReviewState =
  | { status: "loading"; sessionId: string }
  | { status: "error"; sessionId: string; error: string }
  | { status: "ready"; sessionId: string; review: ReviewView; notice: ReviewNotice | null };

export type ReviewAction =
  | { type: "loaded"; review: ReviewView }
  | { type: "load_failed"; error: string }
  | { type: "update"; update: SourceUpdate };

export const initialReviewState = (sessionId: string): ReviewState => ({ status: "loading", sessionId });

function noticeFor(before: ReviewView, after: ReviewView): ReviewNotice {
  if (after.current.revision_id !== before.current.revision_id) {
    return { kind: "new_revision", label: after.current.revision_label };
  }
  if (after.confirmations.length !== before.confirmations.length) {
    return { kind: "confirmation", label: after.current.revision_label };
  }
  return { kind: "updated" };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "loaded":
      // A pushed update may already be newer than a slow initial load.
      if (state.status === "ready") return state;
      return { status: "ready", sessionId: state.sessionId, review: action.review, notice: null };
    case "load_failed":
      if (state.status === "ready") return state;
      return { status: "error", sessionId: state.sessionId, error: action.error };
    case "update": {
      const { update } = action;
      if (update.type !== "review" || update.review.session_id !== state.sessionId) return state;
      if (state.status !== "ready") return { status: "ready", sessionId: state.sessionId, review: update.review, notice: null };
      return { ...state, review: update.review, notice: noticeFor(state.review, update.review) };
    }
  }
}
