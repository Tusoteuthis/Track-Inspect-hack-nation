"use client";

import type { CaptureState } from "@/lib/practice/screenCapture";
import styles from "./practice.module.css";

const COPY: Record<CaptureState["status"], { icon: string; text: string }> = {
  unsupported: { icon: "⊘", text: "This browser cannot share the screen." },
  idle: { icon: "○", text: "Screen not shared. The tutor cannot see your screen." },
  requesting: { icon: "⏳", text: "Waiting for you to choose what to share…" },
  active: { icon: "●", text: "Sharing your screen with the tutor." },
  denied: { icon: "⊘", text: "Screen sharing was not allowed. Choose Share screen to try again." },
  stopped: { icon: "■", text: "Screen sharing stopped. The tutor no longer receives your screen." },
  error: { icon: "✖", text: "Screen sharing failed." },
};

type Props = { state: CaptureState; onStart: () => void; onStop: () => void };

export function ScreenSharePanel({ state, onStart, onStop }: Props) {
  const copy = COPY[state.status];
  const sharing = state.status === "active";
  return (
    <section className={styles.panel} aria-labelledby="screen-heading">
      <h2 id="screen-heading">Screen for the tutor</h2>
      <p className={styles.status} role="status" data-status={state.status} data-testid="screen-status">
        <span aria-hidden="true" className={styles.statusIcon}>
          {copy.icon}
        </span>
        <span>{copy.text}</span>
      </p>
      {sharing ? (
        <p className={styles.hint}>
          {state.last_frame_at_utc
            ? `Last still image received at ${new Date(state.last_frame_at_utc).toLocaleTimeString()}.`
            : "No still image received yet."}{" "}
          Still images are sent every few seconds and when you request a review.
        </p>
      ) : null}
      {state.frame_error ? (
        <p role="alert" className={styles.error}>
          A still image could not be sent: {state.frame_error}
        </p>
      ) : null}
      {state.status === "error" && state.error ? (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      ) : null}
      <div className={styles.row}>
        {sharing ? (
          <button type="button" onClick={onStop}>
            Stop sharing
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={state.status === "unsupported" || state.status === "requesting"}
          >
            Share screen
          </button>
        )}
      </div>
    </section>
  );
}
