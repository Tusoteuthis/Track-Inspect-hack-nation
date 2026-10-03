// Maps WS3 records (web/lib/expert/contracts.ts) to what the review screen says.
// A confirmation only ever speaks for the exact revision it names.
import type { ExpertConfirmation, OpenQuestion } from "@/lib/expert/contracts";
import type { ReviewView } from "@/lib/ui/contracts";

export const isAnswered = (q: OpenQuestion): boolean => q.answered_by_exchange_id !== null;

export function confirmationFor(confirmations: readonly ExpertConfirmation[], revisionId: string): ExpertConfirmation | null {
  const matching = confirmations.filter(c => c.revision_id === revisionId);
  // ISO-8601 UTC strings sort chronologically; on ties the later record wins.
  return matching.reduce<ExpertConfirmation | null>((latest, c) => (!latest || c.at_utc >= latest.at_utc ? c : latest), null);
}

export type ConfirmationState = "none" | ExpertConfirmation["status"];

const VERB: Record<ExpertConfirmation["status"], string> = {
  confirmed: "confirmed",
  corrected: "corrected",
  unresolved: "left unresolved",
};

export function confirmationSummary(review: ReviewView): { state: ConfirmationState; text: string } {
  const label = review.current.revision_label;
  const c = confirmationFor(review.confirmations, review.current.revision_id);
  if (!c) return { state: "none", text: `${label} is not confirmed yet. Confirmation happens in the spoken teach-back.` };
  if (c.status === "confirmed") return { state: c.status, text: `The expert confirmed ${label} in the spoken teach-back.` };
  if (c.status === "corrected") {
    return { state: c.status, text: `The expert corrected ${label} in the spoken teach-back. A revised draft follows.` };
  }
  return { state: c.status, text: `The expert ${VERB[c.status]} ${label} in the spoken teach-back.` };
}

export function previousRevisionNote(review: ReviewView): string | null {
  if (!review.previous) return null;
  const c = confirmationFor(review.confirmations, review.previous.revision_id);
  if (!c) return null;
  return `${review.previous.revision_label} was ${VERB[c.status]} by the expert in the spoken teach-back.`;
}
