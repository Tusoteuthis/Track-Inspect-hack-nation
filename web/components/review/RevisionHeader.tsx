import type { RevisionDiff } from "@/lib/review/revisionDiff";
import { confirmationSummary, previousRevisionNote } from "@/lib/review/ws3Mappers";
import type { ReviewView } from "@/lib/ui/contracts";
import styles from "./review.module.css";

const CONFIRMATION_ICON = { none: "○", confirmed: "✓", corrected: "✎", unresolved: "?" } as const;

function changeText(review: ReviewView, diff: RevisionDiff): string {
  if (!review.previous || !diff.hasPrevious) return "First revision: there is no previous revision to compare with.";
  const prev = review.previous.revision_label;
  if (!diff.anyChange) return `No changes since ${prev}.`;
  const parts = [
    [Object.keys(diff.changed).length, "changed"],
    [diff.added.length, "added"],
    [diff.removed.length, "removed"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, what]) => `${n} ${n === 1 ? "item" : "items"} ${what}`);
  return `Changed since ${prev}: ${parts.join(", ")}.`;
}

/** Which revision is under review, whether it changed, and what the spoken teach-back said about it. */
export function RevisionHeader({ review, diff }: { review: ReviewView; diff: RevisionDiff }) {
  const confirmation = confirmationSummary(review);
  const history = previousRevisionNote(review);
  return (
    <section className={styles.header} aria-label="Revision under review">
      <p className={styles.revisionLine}>
        Revision under review: <strong className={styles.revisionLabel}>{review.current.revision_label}</strong>
      </p>
      <p className={styles.changed} data-changed={diff.anyChange ? "yes" : "no"}>
        <span aria-hidden="true">{diff.anyChange ? "● " : "○ "}</span>
        {changeText(review, diff)}
      </p>
      {review.current.change_reason ? (
        <p className={styles.reason}>
          Reason for this revision: {review.current.change_reason} <span className={styles.hint}>(apprentice wording)</span>
        </p>
      ) : null}
      <p className={styles.confirmation} data-confirmation={confirmation.state}>
        <span aria-hidden="true">{CONFIRMATION_ICON[confirmation.state]} </span>
        {confirmation.text}
      </p>
      {history ? <p className={styles.hint}>{history}</p> : null}
    </section>
  );
}
