import type { FieldChange } from "@/lib/review/revisionDiff";
import styles from "./review.module.css";

/** What changed in one item since the previous revision, as old → new. */
export function ChangeList({ changes, added, previousLabel }: { changes: FieldChange[]; added: boolean; previousLabel: string | null }) {
  if (!previousLabel) return null;
  if (added) {
    return (
      <section className={styles.changes} aria-label="Changes">
        <p>
          <strong>New in this revision.</strong> It did not exist in {previousLabel}.
        </p>
      </section>
    );
  }
  if (changes.length === 0) return null;
  return (
    <section className={styles.changes} aria-labelledby="changes-title">
      <h3 id="changes-title">What changed since {previousLabel}</h3>
      <dl>
        {changes.map(c => (
          <div key={c.field} className={styles.change} data-change-field={c.field}>
            <dt>{c.label}</dt>
            <dd>
              <del aria-label={`Before: ${c.before}`}>{c.before}</del>
              <span aria-hidden="true"> → </span>
              <ins aria-label={`After: ${c.after}`}>{c.after}</ins>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
