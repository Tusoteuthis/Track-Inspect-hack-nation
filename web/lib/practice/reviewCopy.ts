// What each review state looks like to the learner: icon + text (never colour
// alone), and why Save is unavailable when it is.
import type { ReviewStatus } from "@/lib/ui/contracts";

export type ReviewCopy = {
  icon: string;
  label: string;
  /** Shown next to a disabled Save button; null when Save is available. */
  saveBlockedReason: string | null;
  tone: "neutral" | "pending" | "warn" | "ok" | "danger";
};

export const REVIEW_COPY: Record<ReviewStatus, ReviewCopy> = {
  editing_unreviewed: {
    icon: "✎",
    label: "Draft changed / not yet reviewed",
    saveBlockedReason: "Save is available after the tutor has reviewed this exact draft. Request a review first.",
    tone: "neutral",
  },
  review_pending: {
    icon: "⏳",
    label: "Review pending",
    saveBlockedReason: "Waiting for the review of this draft.",
    tone: "pending",
  },
  guidance_needed: {
    icon: "⚠",
    label: "Guidance needed: reconsider your draft",
    saveBlockedReason: "The review asks you to reconsider. Change your draft, then request a new review.",
    tone: "warn",
  },
  review_complete: {
    icon: "✓",
    label: "Review complete: ready to save",
    saveBlockedReason: null,
    tone: "ok",
  },
  saving: {
    icon: "⏳",
    label: "Saving… waiting for confirmation",
    saveBlockedReason: "Saving is in progress.",
    tone: "pending",
  },
  saved: {
    icon: "✔",
    label: "Saved",
    saveBlockedReason: "This draft has been saved.",
    tone: "ok",
  },
  save_failed: {
    icon: "✖",
    label: "Save failed: not saved",
    saveBlockedReason: null,
    tone: "danger",
  },
};

export function canSave(status: ReviewStatus): boolean {
  return status === "review_complete" || status === "save_failed";
}
