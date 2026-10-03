// Derives the learner timeline (proposed → guidance → corrected → saved) from
// review-state transitions. "saved" is only recorded on the acknowledged state.
import type { ReviewMachineState } from "@/lib/practice/reviewMachine";
import type { PracticeTimelineEntry } from "@/lib/ui/contracts";

export function nextTimelineEntry(
  prev: ReviewMachineState,
  next: ReviewMachineState,
  entries: readonly PracticeTimelineEntry[],
  atUtc: string
): PracticeTimelineEntry | null {
  if (prev.status === next.status) return null;
  const make = (kind: PracticeTimelineEntry["kind"]): PracticeTimelineEntry => ({
    kind,
    at_utc: atUtc,
    draft_revision: next.draft_revision,
  });
  switch (next.status) {
    case "review_pending":
      if (entries.some(e => e.kind === "guidance")) return make("corrected");
      return entries.some(e => e.kind === "proposed") ? null : make("proposed");
    case "guidance_needed":
      return make("guidance");
    case "saved":
      return make("saved");
    default:
      return null;
  }
}
