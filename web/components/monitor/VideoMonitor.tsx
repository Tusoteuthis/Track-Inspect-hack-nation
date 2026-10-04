"use client";

// The expert's inspection player on the demo monitor, read through the glasses.
// The video sits in its own row: chrome is above and below it, never on it.
// Auto-holds freeze the frame so the expert can point at a still picture; the
// prompt is neutral and never names what is shown. Driven by single keys a
// presentation clicker can send; no mouse needed.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppLogo } from "@/components/shell/AppLogo";
import {
  openMonitorChannel,
  type MonitorLink,
  type MonitorStateMessage,
  type SessionRecording,
} from "@/lib/monitor/monitorChannel";
import { keyToCommand, type PlaybackState } from "@/lib/monitor/playback";
import type { CaseMedia, CaseSummary } from "@/lib/ui/contracts";
import { formatMediaTime, MonitorTimeline } from "./MonitorTimeline";
import styles from "./monitor.module.css";
import { monitorStateMessage, usePlayback } from "./usePlayback";

type Props = { caseSummary: CaseSummary & { media: CaseMedia }; onExit: () => void };

/** While playing, the companion hears at most this often. */
const BROADCAST_INTERVAL_MS = 250;

const SESSION_COPY: Record<SessionRecording, { icon: string; text: string }> = {
  recording: { icon: "●", text: "REC" },
  off_record: { icon: "⊘", text: "OFF RECORD" },
  paused: { icon: "⏸", text: "PAUSED" },
  none: { icon: "○", text: "No session" },
};

export function VideoMonitor({ caseSummary, onExit }: Props) {
  const { media } = caseSummary;
  const { videoRef, playback, stateRef, dispatch, videoEvents } = usePlayback(media);
  const [session, setSession] = useState<SessionRecording>("none");
  const linkRef = useRef<MonitorLink | null>(null);
  const lastSent = useRef(0);
  const sentStatus = useRef<PlaybackState["status"] | null>(null);

  const message = useCallback(
    (s: PlaybackState): MonitorStateMessage => monitorStateMessage(caseSummary.case_id, media, s),
    [caseSummary.case_id, media]
  );

  // Link to the companion: answer its hello, mirror its session state, say bye on close.
  useEffect(() => {
    const link = openMonitorChannel(m => {
      if (m.type === "session_state") setSession(m.recording);
      else if (m.type === "hello" && m.from === "companion") link.post(message(stateRef.current));
    });
    linkRef.current = link;
    link.post({ type: "hello", from: "monitor" });
    const bye = () => link.post({ type: "bye", from: "monitor" });
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
      link.close();
      linkRef.current = null;
    };
  }, [message, stateRef]);

  // Report every status change at once; time updates while playing are throttled.
  useEffect(() => {
    const now = Date.now();
    const sinceLast = now - lastSent.current;
    const prevStatus = sentStatus.current;
    if (playback.status === "playing" && prevStatus === "playing" && sinceLast < BROADCAST_INTERVAL_MS) return;
    lastSent.current = now;
    sentStatus.current = playback.status;
    linkRef.current?.post(message(playback));
  }, [message, playback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const command = keyToCommand(e);
      if (!command) return;
      e.preventDefault();
      if (command === "exit") return onExit();
      if (e.repeat && command !== "seek_back" && command !== "seek_forward") return;
      dispatch({ type: "command", command });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, onExit]);

  const { status } = playback;
  const holdNumber = playback.hold_index !== null ? playback.hold_index + 1 : null;
  const sessionCopy = SESSION_COPY[session];

  return (
    <div className={styles.monitor} data-testid="video-monitor" data-status={status}>
      <header className={styles.topBar}>
        <span className={styles.brand}>
          <AppLogo size={36} />
          <span className={styles.caseTitle}>{caseSummary.title}</span>
        </span>
        <span className={styles.topRight}>
          <span className={styles.sessionPill} data-session={session} data-testid="monitor-session" role="status">
            <span aria-hidden="true">{sessionCopy.icon}</span> {sessionCopy.text}
          </span>
          {caseSummary.source === "fixture" ? (
            <span className={styles.fixtureBadge} role="status">
              FIXTURE DATA
            </span>
          ) : null}
        </span>
      </header>

      <div className={styles.stage} data-held={status === "held" ? "true" : undefined}>
        {status === "error" ? (
          <p className={styles.errorMessage} role="alert">
            The video for {caseSummary.title} could not be loaded · Esc to return
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
          aria-label={`Case video: ${caseSummary.title}`}
          {...videoEvents}
          hidden={status === "error"}
        />
      </div>

      <footer className={styles.bottomBar}>
        <Prompt state={playback} holdNumber={holdNumber} holdCount={media.holds.length} />
        <div className={styles.timelineRow}>
          <span className={styles.time} data-testid="monitor-time">
            {formatMediaTime(playback.time_ms)} <span className={styles.timeTotal}>/ {formatMediaTime(media.duration_ms)}</span>
          </span>
          <MonitorTimeline media={media} timeMs={playback.time_ms} heldIndex={playback.hold_index} size="large" />
          <span className={styles.autoHold} data-on={playback.auto_holds ? "true" : "false"}>
            <span aria-hidden="true">{playback.auto_holds ? "◉" : "○"}</span> Auto-hold {playback.auto_holds ? "on" : "off"}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Prompt({ state, holdNumber, holdCount }: { state: PlaybackState; holdNumber: number | null; holdCount: number }) {
  const keys = (items: [string, string][]) => (
    <span className={styles.keys}>
      {items.map(([k, label]) => (
        <span key={k} className={styles.keyHint}>
          <kbd>{k}</kbd> {label}
        </span>
      ))}
    </span>
  );
  switch (state.status) {
    case "start":
      return (
        <div className={styles.prompt} data-testid="monitor-prompt" role="status">
          <span className={styles.promptText}>Press Space to start</span>
          {keys([["H", `auto-hold ${state.auto_holds ? "off" : "on"}`]])}
        </div>
      );
    case "held":
      return (
        <div className={styles.prompt} data-tone="held" data-testid="monitor-prompt" role="status">
          <span className={styles.promptText}>
            <strong>
              Hold {holdNumber} of {holdCount}
            </strong>{" "}
            · Point at what you see and explain it.
          </span>
          {keys([
            ["Space", "resume"],
            ["PgUp", "previous hold"],
            ["← →", "1 s"],
          ])}
        </div>
      );
    case "paused":
      return (
        <div className={styles.prompt} data-testid="monitor-prompt" role="status">
          <span className={styles.promptText}>Paused</span>
          {keys([
            ["Space", "play"],
            ["PgUp", "previous hold"],
            ["← →", "1 s"],
          ])}
        </div>
      );
    case "ended":
      return (
        <div className={styles.prompt} data-testid="monitor-prompt" role="status">
          <span className={styles.promptText}>End of recording</span>
          {keys([
            ["R", "replay"],
            ["PgUp", "previous hold"],
          ])}
        </div>
      );
    case "playing":
      return (
        <div className={styles.prompt} data-tone="quiet" data-testid="monitor-prompt">
          <span className={styles.promptText}>
            <span aria-hidden="true">▶</span> Playing
          </span>
          {keys([["Space", "pause"]])}
        </div>
      );
    case "error":
      return null;
  }
}
