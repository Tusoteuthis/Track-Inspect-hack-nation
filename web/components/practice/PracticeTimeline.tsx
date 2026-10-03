import type { PracticeTimelineEntry } from "@/lib/ui/contracts";
import styles from "./practice.module.css";

const LABEL: Record<PracticeTimelineEntry["kind"], string> = {
  proposed: "Proposed",
  guidance: "Guidance received",
  corrected: "Corrected draft sent for review",
  saved: "Saved",
};

export function PracticeTimeline({ entries }: { entries: PracticeTimelineEntry[] }) {
  return (
    <section className={styles.panel} aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">Timeline</h2>
      {entries.length === 0 ? (
        <p className={styles.hint}>Nothing recorded yet.</p>
      ) : (
        <ol className={styles.timeline} data-testid="timeline">
          {entries.map((e, i) => (
            <li key={i} data-kind={e.kind}>
              <strong>{LABEL[e.kind]}</strong>{" "}
              <time dateTime={e.at_utc}>{new Date(e.at_utc).toLocaleTimeString()}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
