"use client";

// Expert session setup: pick a case, see the real connection status, open the
// full-bleed trace display for the demo monitor, then start. Start shows
// "Starting…" until the session service acknowledges it.
import { type ReactNode, useEffect, useState } from "react";
import { useDataSource, useSourceQuery } from "@/lib/data/DataSourceProvider";
import type { AgentState } from "@/lib/ui/agentState";
import type { CaseSummary, SessionView } from "@/lib/ui/contracts";
import { ConnectionPanel } from "./ConnectionPanel";
import styles from "./companion.module.css";

type Props = {
  agent: AgentState;
  onStarted: (session: SessionView, chosen: CaseSummary) => void;
  /** Case currently selected; lifted so the optional screen share can follow it. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Live state of the demo monitor for the chosen case (video cases). */
  renderMonitor?: (chosen: CaseSummary) => ReactNode;
};

export const displayHref = (caseId: string) => `/expert/display?case=${encodeURIComponent(caseId)}`;

export function ExpertSetup({ agent, onStarted, selectedId, onSelect, renderMonitor }: Props) {
  const source = useDataSource();
  const cases = useSourceQuery("cases", s => s.listCases());
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const firstId = cases.status === "ready" ? (cases.data[0]?.case_id ?? null) : null;

  // Preselect the first case so the choice is explicit everywhere (e.g. screen share).
  useEffect(() => {
    if (!selectedId && firstId) onSelect(firstId);
  }, [firstId, onSelect, selectedId]);

  if (cases.status === "loading") return <p className="state-message">Loading cases…</p>;
  if (cases.status === "error")
    return (
      <p className="state-message error" role="alert">
        The case list could not be loaded: {cases.error}
      </p>
    );

  const list = cases.data;
  const chosen = list.find(c => c.case_id === selectedId) ?? list[0] ?? null;

  const start = async () => {
    if (!chosen || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const ack = await source.startSession(chosen.case_id);
      if (ack.status === "acknowledged") onStarted(ack.value, chosen);
      else setStartError(ack.error);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={styles.screen}>
      <section className={styles.panel} aria-labelledby="case-heading">
        <h2 id="case-heading">1. Choose the case</h2>
        {list.length === 0 ? (
          <p className="state-message">No cases are available.</p>
        ) : (
          <fieldset className={styles.cases}>
            <legend className={styles.hint}>Trace shown on the demo monitor during the session</legend>
            {list.map(c => (
              <label key={c.case_id} className={styles.case}>
                <span className={styles.caseTitle}>
                  <input
                    type="radio"
                    name="case"
                    value={c.case_id}
                    checked={chosen?.case_id === c.case_id}
                    onChange={() => onSelect(c.case_id)}
                  />
                  {c.title}
                </span>
                {c.media ? (
                  <span className={styles.caseMeta}>
                    Video · {(c.media.duration_ms / 1000).toFixed(1)} s · {c.media.holds.length} holds
                  </span>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- trace thumbnails at their own aspect */}
                <img src={c.asset.original_url} alt="" width={c.asset.width_px} height={c.asset.height_px} />
              </label>
            ))}
          </fieldset>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="display-heading">
        <h2 id="display-heading">2. Put the trace on the demo monitor</h2>
        <p className={styles.hint}>
          {chosen?.media
            ? "The video plays on this page as soon as the session starts and holds at each marked moment for pointing. Optional, for a second screen: open the full-screen player (Space plays, PgUp goes back) and move it to the demo monitor."
            : "Opens the trace full-screen at the largest legible size, for reading through the glasses. Move the window to the demo monitor."}
        </p>
        {chosen && renderMonitor ? renderMonitor(chosen) : null}
        <div className={styles.actions}>
          {chosen ? (
            <a className={styles.secondary} href={displayHref(chosen.case_id)} target="_blank" rel="noopener">
              Open trace display (new window)
            </a>
          ) : null}
        </div>
      </section>

      <section className={styles.panel}>
        <ConnectionPanel capture="unknown" agent={agent} backend={source.kind === "fixture" ? "fixture" : "unknown"} />
        <p className={styles.hint}>The voice apprentice is started from the companion once the session runs.</p>
      </section>

      <section className={styles.panel} aria-labelledby="start-heading">
        <h2 id="start-heading">3. Start</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void start()} disabled={!chosen || starting}>
            {starting ? "Starting… waiting for confirmation" : "Start session"}
          </button>
        </div>
        {startError ? (
          <p role="alert" className={styles.error}>
            The session did not start: {startError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
