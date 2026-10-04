// Read-only mirror of the demo monitor for the companion: what the expert is
// looking at right now (playing, held at hold n, ended) on the case video's
// timeline. It never controls playback; the expert does, at the monitor.
import { formatMediaTime, MonitorTimeline } from "@/components/monitor/MonitorTimeline";
import type { MonitorStateMessage, MonitorStatus } from "@/lib/monitor/monitorChannel";
import type { CaseMedia } from "@/lib/ui/contracts";
import styles from "./companion.module.css";

type Props = {
  caseId: string;
  media: CaseMedia;
  monitor: MonitorStateMessage | null;
  openHref: string;
  /** Setup already has its own open link next to the strip. */
  showOpenLink?: boolean;
};

const STATUS_COPY: Record<MonitorStatus, { icon: string; text: (m: MonitorStateMessage) => string }> = {
  start: { icon: "■", text: () => "Ready · the expert starts it at the monitor" },
  playing: { icon: "▶", text: () => "Playing" },
  paused: { icon: "⏸", text: () => "Paused" },
  held: { icon: "◉", text: m => `Hold ${m.hold_index} of ${m.hold_count} · frame held for pointing` },
  ended: { icon: "■", text: () => "End of recording" },
  error: { icon: "⚠", text: () => "Video error on the monitor" },
};

export function MonitorStrip({ caseId, media, monitor, openHref, showOpenLink = true }: Props) {
  if (!monitor) {
    return (
      <section className={styles.monitorStrip} aria-label="Demo monitor" data-testid="monitor-strip" data-monitor="none">
        <p className={styles.monitorStatus}>
          <span aria-hidden="true">○</span> Monitor not open
        </p>
        {showOpenLink ? (
          <a className={styles.secondary} href={openHref} target="_blank" rel="noopener">
            Open trace display (new window)
          </a>
        ) : null}
      </section>
    );
  }

  const copy = STATUS_COPY[monitor.status];
  const otherCase = monitor.case_id !== caseId;
  return (
    <section
      className={styles.monitorStrip}
      aria-label="Demo monitor"
      data-testid="monitor-strip"
      data-monitor={monitor.status}
    >
      <div className={styles.monitorHead}>
        <p className={styles.monitorStatus} role="status" data-tone={monitor.status}>
          <span aria-hidden="true">{copy.icon}</span> <span>Monitor · {copy.text(monitor)}</span>
        </p>
        <span className={styles.monitorTime}>
          {formatMediaTime(monitor.media_time_ms)} / {formatMediaTime(monitor.duration_ms)}
          {monitor.auto_holds ? "" : " · auto-hold off"}
        </span>
      </div>
      {otherCase ? (
        <p className={styles.error} role="alert">
          The monitor shows a different case. Reopen the trace display for this case.
        </p>
      ) : (
        <MonitorTimeline
          media={media}
          timeMs={monitor.media_time_ms}
          heldIndex={monitor.hold_index !== null ? monitor.hold_index - 1 : null}
          size="compact"
        />
      )}
    </section>
  );
}
