"use client";

// The case video on the companion page itself, for a single-screen demo: it
// starts with the session and holds at each marked moment like the monitor
// does. Buttons instead of keys, so it never competes with the companion's
// shortcuts. Holds are reported through onState exactly as the monitor
// window would report them.
import { useEffect, useRef } from "react";
import type { MonitorStateMessage } from "@/lib/monitor/monitorChannel";
import type { CaseMedia } from "@/lib/ui/contracts";
import { formatMediaTime, MonitorTimeline } from "./MonitorTimeline";
import styles from "./inline.module.css";
import { monitorStateMessage, usePlayback } from "./usePlayback";

type Props = {
  caseId: string;
  title: string;
  media: CaseMedia;
  /** Start playing as soon as it mounts (the session has just started). */
  autoStart?: boolean;
  onState?: (state: MonitorStateMessage) => void;
};

/** While playing, onState fires at most this often. */
const REPORT_INTERVAL_MS = 250;

export function InlineVideoPlayer({ caseId, title, media, autoStart = false, onState }: Props) {
  const { videoRef, playback, dispatch, videoEvents } = usePlayback(media);
  const started = useRef(false);
  const lastSent = useRef(0);
  const sentStatus = useRef<string | null>(null);

  // Once only: a second "play" would toggle it back to paused (StrictMode runs effects twice).
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    dispatch({ type: "command", command: "play" });
  }, [autoStart, dispatch]);

  useEffect(() => {
    if (!onState) return;
    const now = Date.now();
    if (playback.status === "playing" && sentStatus.current === "playing" && now - lastSent.current < REPORT_INTERVAL_MS)
      return;
    lastSent.current = now;
    sentStatus.current = playback.status;
    onState(monitorStateMessage(caseId, media, playback));
  }, [caseId, media, onState, playback]);

  const { status } = playback;
  const holdNumber = playback.hold_index !== null ? playback.hold_index + 1 : null;
  const command = (c: "play" | "previous_hold" | "restart") => dispatch({ type: "command", command: c });

  return (
    <section className={styles.player} aria-label={`Case video: ${title}`} data-testid="inline-video" data-status={status}>
      <div className={styles.stage} style={{ aspectRatio: `${media.width_px} / ${media.height_px}` }}>
        {status === "error" ? (
          <p className={styles.error} role="alert">
            The video could not be loaded.
          </p>
        ) : null}
        <video
          ref={videoRef}
          className={styles.video}
          src={media.url}
          poster={media.poster_url}
          muted
          playsInline
          preload="auto"
          {...videoEvents}
          hidden={status === "error"}
        />
      </div>
      <div className={styles.bar}>
        <p className={styles.status} role="status" data-tone={status}>
          {status === "held"
            ? `Hold ${holdNumber} of ${media.holds.length} · point at what you see and explain it`
            : status === "playing"
              ? "▶ Playing"
              : status === "paused"
                ? "Paused"
                : status === "ended"
                  ? "End of recording"
                  : status === "start"
                    ? "Ready"
                    : ""}
        </p>
        <span className={styles.time}>
          {formatMediaTime(playback.time_ms)} / {formatMediaTime(media.duration_ms)}
        </span>
      </div>
      <MonitorTimeline media={media} timeMs={playback.time_ms} heldIndex={playback.hold_index} size="compact" />
      <div className={styles.controls}>
        {status === "ended" ? (
          <button type="button" className={styles.button} onClick={() => command("restart")}>
            Replay
          </button>
        ) : (
          <button
            type="button"
            className={styles.button}
            data-primary="true"
            onClick={() => command("play")}
            disabled={status === "error"}
          >
            {status === "playing" ? "Pause" : status === "held" ? "Resume" : "Play"}
          </button>
        )}
        <button type="button" className={styles.button} onClick={() => command("previous_hold")} disabled={status === "error"}>
          Previous hold
        </button>
      </div>
    </section>
  );
}
