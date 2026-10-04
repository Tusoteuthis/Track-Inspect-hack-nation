"use client";

// Expert companion during a session: the active trace with the latest
// indicated region (on that event's own frame), recent pointing, real agent
// status, acknowledged recording state and the control rail. It only displays
// pointing; it never sends anything to the voice agent.
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import { ConnectionStatus } from "@/components/shell/ConnectionStatus";
import { displayRecording } from "@/lib/companion/companionMachine";
import {
  AGENT_COPY,
  AMBIGUOUS_NOTICE,
  formatSessionTime,
  RECORDING_COPY,
  UNRESOLVED_NOTICE,
} from "@/lib/companion/copy";
import { shortcutFor, SHORTCUT_KEYS } from "@/lib/companion/shortcuts";
import type { DataSource } from "@/lib/data/source";
import type { AgentState } from "@/lib/ui/agentState";
import type { EvidenceAsset } from "@/lib/ui/contracts";
import { ConnectionPanel } from "./ConnectionPanel";
import { ControlRail } from "./ControlRail";
import { RecentEvents } from "./RecentEvents";
import { useCompanion } from "./useCompanion";
import styles from "./companion.module.css";

const STOP_ARM_MS = 5000;

type Props = {
  source: DataSource;
  sessionId: string;
  /** The case trace, shown until the first pointing event arrives. */
  caseAsset: EvidenceAsset | null;
  agent: AgentState;
  /** The voice session (WS3); lives in the rail and stays mounted when the rail collapses. */
  voice?: ReactNode;
  fixtureControls?: ReactNode;
};

export function ExpertCompanion({ source, sessionId, caseAsset, agent, voice, fixtureControls }: Props) {
  const { state, loadError, syncing, request } = useCompanion(source, sessionId);
  const [railOpen, setRailOpen] = useState(true);
  const [stopArmed, setStopArmed] = useState(false);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    disarmTimer.current = null;
    setStopArmed(false);
  }, []);
  useEffect(() => disarm, [disarm]);

  const { session, pending } = state;
  const recording = displayRecording(state);

  const pressPause = useCallback(() => {
    if (!session) return;
    request("pause", session.lifecycle !== "paused");
  }, [request, session]);
  const pressOffRecord = useCallback(() => {
    if (!session) return;
    request("off_record", session.recording_state !== "off_record");
  }, [request, session]);
  // Stop is irreversible, so it takes two presses (no dialog: it would cover the trace).
  const pressStop = useCallback(() => {
    if (pending.stop !== undefined) return;
    if (stopArmed) {
      disarm();
      request("stop", true);
      return;
    }
    setStopArmed(true);
    disarmTimer.current = setTimeout(() => setStopArmed(false), STOP_ARM_MS);
  }, [disarm, pending.stop, request, stopArmed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stopArmed) return disarm();
      const target = e.target instanceof HTMLElement ? e.target : null;
      const action = shortcutFor({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        targetTag: target?.tagName ?? "",
        targetEditable: target?.isContentEditable ?? false,
      });
      if (!action || e.repeat) return;
      e.preventDefault();
      if (action === "toggle_rail") setRailOpen(open => !open);
      else if (action === "pause") pressPause();
      else if (action === "off_record") pressOffRecord();
      else pressStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disarm, pressOffRecord, pressPause, pressStop, stopArmed]);

  if (!session) {
    return loadError ? (
      <p className="state-message error" role="alert">
        The session could not be loaded: {loadError}
      </p>
    ) : (
      <p className="state-message">Loading session…</p>
    );
  }

  if (session.lifecycle === "ended") {
    return (
      <div className={styles.screen}>
        <p className={styles.status} role="status" data-tone="ok" data-testid="session-ended">
          <span aria-hidden="true" className={styles.statusIcon}>
            ■
          </span>
          <span>Session ended</span>
        </p>
        <p className={styles.hint}>
          The spoken debrief and teach-back continue in the review, where every step shows the expert&apos;s own
          words and evidence.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={`/review?${new URLSearchParams({ session: sessionId })}`}>
            Open debrief review
          </Link>
        </div>
        <RecentEvents events={state.events} />
      </div>
    );
  }

  const latest = state.events[0] ?? null;
  const agentCopy = AGENT_COPY[agent];

  return (
    <div className={styles.screen}>
      <div className={styles.statusBar}>
        {recording === "off_record" ? (
          <p className={styles.offRecord} role="status" data-testid="off-record-indicator">
            <span aria-hidden="true">⊘</span> OFF RECORD
          </p>
        ) : recording ? (
          <p
            className={styles.status}
            role="status"
            data-testid="recording-status"
            data-recording={recording}
            data-tone={recording.endsWith("_pending") ? "pending" : "ok"}
          >
            <span aria-hidden="true" className={styles.statusIcon}>
              {RECORDING_COPY[recording].icon}
            </span>
            <span>{RECORDING_COPY[recording].text}</span>
          </p>
        ) : null}
        <p className={styles.status} role="status" data-testid="agent-status" data-status={agent}>
          <span aria-hidden="true" className={styles.statusIcon}>
            {agentCopy.icon}
          </span>
          <span>{agentCopy.text}</span>
        </p>
        {session.lifecycle === "paused" ? (
          <p className={styles.status} role="status" data-testid="paused-status" data-tone="pending">
            <span aria-hidden="true" className={styles.statusIcon}>
              ⏸
            </span>
            <span>Paused</span>
          </p>
        ) : null}
      </div>

      {state.connection === "reconnecting" || state.connection === "disconnected" ? (
        <ConnectionStatus state={state.connection} />
      ) : syncing ? (
        <p className={styles.hint} role="status">
          Updating to the latest state…
        </p>
      ) : null}
      {loadError ? (
        <p className={styles.error} role="alert">
          Could not refresh the session: {loadError}
        </p>
      ) : null}

      <div className={styles.layout} data-rail={railOpen ? "expanded" : "collapsed"}>
        <section className={styles.trace} aria-label="Active trace" data-testid="companion-trace">
          {latest ? (
            <EvidenceViewer
              key={latest.event_id}
              asset={latest.asset}
              region={latest.region}
              notice={{ ambiguous: AMBIGUOUS_NOTICE, unresolved: UNRESOLVED_NOTICE }}
              caption={`Latest indicated region, session time ${formatSessionTime(latest.session_time_ms)}`}
            />
          ) : caseAsset ? (
            <EvidenceViewer
              asset={caseAsset}
              region={null}
              caption="Active trace. No pointing yet: point at the trace and the indicated region appears here."
            />
          ) : (
            <p className={styles.empty}>No pointing yet.</p>
          )}
          <RecentEvents events={state.events} />
        </section>

        <aside className={styles.rail} aria-label="Session controls" data-testid="control-rail">
          <button
            type="button"
            className={styles.railToggle}
            aria-expanded={railOpen}
            aria-controls="companion-rail-body"
            aria-keyshortcuts={SHORTCUT_KEYS.toggle_rail}
            onClick={() => setRailOpen(open => !open)}
          >
            <span className={styles.railToggleText}>{railOpen ? "Hide controls" : "Controls"}</span>
            <kbd className={styles.kbd}>{SHORTCUT_KEYS.toggle_rail}</kbd>
          </button>
          <div id="companion-rail-body" className={styles.railBody} hidden={!railOpen}>
            <ControlRail
              state={state}
              stopArmed={stopArmed}
              onPause={pressPause}
              onOffRecord={pressOffRecord}
              onStop={pressStop}
            />
            <ConnectionPanel
              capture={session.connection.capture}
              agent={agent}
              backend={source.kind === "fixture" ? "fixture" : state.connection}
            />
            {voice ? (
              <section className={styles.section} aria-labelledby="voice-heading">
                <h2 id="voice-heading">Voice apprentice</h2>
                <p className={styles.hint}>The apprentice decides when to ask. Nothing on this page prompts it to speak.</p>
                {voice}
              </section>
            ) : null}
            {fixtureControls}
          </div>
        </aside>
      </div>
    </div>
  );
}
