"use client";

import type { CompanionMachineState, RequestKind } from "@/lib/companion/companionMachine";
import { SHORTCUT_KEYS } from "@/lib/companion/shortcuts";
import styles from "./companion.module.css";

type Props = {
  state: CompanionMachineState;
  stopArmed: boolean;
  onPause: () => void;
  onOffRecord: () => void;
  onStop: () => void;
};

const FAILED: Record<RequestKind, (error: string, state: CompanionMachineState) => string> = {
  off_record: (error, s) =>
    `Off-record change not confirmed: ${error} You are still ${s.session?.recording_state === "off_record" ? "off record" : "on record"}.`,
  pause: (error, s) =>
    `Pause/resume not confirmed: ${error} The session is still ${s.session?.lifecycle === "paused" ? "paused" : "running"}.`,
  stop: error => `Stop not confirmed: ${error} The session is still running.`,
};

/** Pause, off-record and stop. Each shows "waiting for confirmation" until the source acknowledges it. */
export function ControlRail({ state, stopArmed, onPause, onOffRecord, onStop }: Props) {
  const { session, pending, errors } = state;
  const lifecycle = session?.lifecycle;
  const live = lifecycle === "active" || lifecycle === "paused";
  const off = session?.recording_state === "off_record";

  const pauseLabel =
    pending.pause === true
      ? "Pausing… waiting for confirmation"
      : pending.pause === false
        ? "Resuming… waiting for confirmation"
        : lifecycle === "paused"
          ? "Resume session"
          : "Pause session";
  const offLabel =
    pending.off_record === true
      ? "Going off record… waiting for confirmation"
      : pending.off_record === false
        ? "Going back on record… waiting for confirmation"
        : off
          ? "Back on record"
          : "Go off record";
  const stopLabel =
    pending.stop !== undefined ? "Stopping… waiting for confirmation" : stopArmed ? "Press again to stop" : "Stop session";

  return (
    <section className={styles.section} aria-labelledby="controls-heading">
      <h2 id="controls-heading">Session controls</h2>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={onPause}
          disabled={!live || pending.pause !== undefined}
          data-pending={pending.pause !== undefined}
          aria-keyshortcuts={SHORTCUT_KEYS.pause}
        >
          <span>{pauseLabel}</span>
          <kbd className={styles.kbd}>{SHORTCUT_KEYS.pause}</kbd>
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={onOffRecord}
          disabled={!live || pending.off_record !== undefined}
          data-pending={pending.off_record !== undefined}
          aria-keyshortcuts={SHORTCUT_KEYS.off_record}
        >
          <span>{offLabel}</span>
          <kbd className={styles.kbd}>{SHORTCUT_KEYS.off_record}</kbd>
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={onStop}
          disabled={!live || pending.stop !== undefined}
          data-pending={pending.stop !== undefined}
          data-armed={stopArmed}
          aria-keyshortcuts={SHORTCUT_KEYS.stop}
        >
          <span>{stopLabel}</span>
          <kbd className={styles.kbd}>{SHORTCUT_KEYS.stop}</kbd>
        </button>
      </div>
      {stopArmed && pending.stop === undefined ? (
        <p className={styles.hint} role="status">
          Stopping ends the session. Press Stop again to confirm, or Escape to cancel.
        </p>
      ) : null}
      {(Object.keys(errors) as RequestKind[]).map(kind => (
        <p key={kind} role="alert" className={styles.error}>
          {FAILED[kind](errors[kind]!, state)}
        </p>
      ))}
      <p className={styles.hint}>
        Off record is requested here and shown only after the session service confirms it.
      </p>
    </section>
  );
}
