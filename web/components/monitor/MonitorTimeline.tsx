// Chapter segments, numbered hold ticks and the playhead for a case video.
// Used large on the monitor and compact in the companion's monitor strip.
import type { CaseMedia } from "@/lib/ui/contracts";
import styles from "./monitor.module.css";

type Props = {
  media: CaseMedia;
  timeMs: number;
  /** 0-based index of the hold currently held, if any. */
  heldIndex: number | null;
  size: "large" | "compact";
};

const pct = (ms: number, duration: number) => `${Math.min(100, Math.max(0, (ms / duration) * 100))}%`;

export function MonitorTimeline({ media, timeMs, heldIndex, size }: Props) {
  const { duration_ms: duration } = media;
  return (
    <div className={styles.timeline} data-size={size} data-testid="monitor-timeline">
      <div className={styles.track}>
        {media.chapters.map(c => (
          <div
            key={c.chapter_id}
            className={styles.chapter}
            data-current={timeMs >= c.start_ms && timeMs < c.end_ms ? "true" : undefined}
            style={{ left: pct(c.start_ms, duration), width: pct(c.end_ms - c.start_ms, duration) }}
          >
            <span className={styles.chapterLabel}>{c.label}</span>
          </div>
        ))}
        <div className={styles.progress} style={{ width: pct(timeMs, duration) }} />
        {media.holds.map((h, i) => (
          <span
            key={h.hold_id}
            className={styles.holdTick}
            data-held={heldIndex === i ? "true" : undefined}
            data-passed={timeMs >= h.at_ms ? "true" : undefined}
            style={{ left: pct(h.at_ms, duration) }}
            aria-hidden="true"
          >
            {i + 1}
          </span>
        ))}
        <span className={styles.playhead} style={{ left: pct(timeMs, duration) }} aria-hidden="true" />
      </div>
    </div>
  );
}

/** "12.4 s" — media time, one decimal. */
export const formatMediaTime = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
