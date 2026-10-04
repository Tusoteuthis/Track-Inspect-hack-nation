"use client";

import { AGENT_COPY, CONNECTION_COPY, type Copy } from "@/lib/companion/copy";
import type { AgentState } from "@/lib/ui/agentState";
import type { ConnectionState } from "@/lib/ui/contracts";
import styles from "./companion.module.css";

type Props = {
  /** WS2 capture device as reported by the session service; "unknown" until it reports. */
  capture: ConnectionState;
  /** Real voice session state from this page. */
  agent: AgentState;
  /** Backend connection; "fixture" when no backend is involved at all. */
  backend: ConnectionState | "fixture";
};

const FIXTURE_BACKEND: Copy = { icon: "⊘", text: "No backend: fixture data" };

/** Actual connection status. Unknown stays "Unknown"; nothing is shown as connected without a signal. */
export function ConnectionPanel({ capture, agent, backend }: Props) {
  const rows: { label: string; copy: Copy; state: string; hint?: string }[] = [
    {
      label: "Capture device",
      copy: CONNECTION_COPY[capture],
      state: capture,
      hint: capture === "unknown" ? "The glasses and phone don't report their status to this page yet." : undefined,
    },
    { label: "Voice apprentice", copy: AGENT_COPY[agent], state: agent },
    { label: "Backend", copy: backend === "fixture" ? FIXTURE_BACKEND : CONNECTION_COPY[backend], state: backend },
  ];
  return (
    <section className={styles.section} aria-labelledby="connections-heading">
      <h2 id="connections-heading">Connections</h2>
      <dl className={styles.statusList}>
        {rows.map(row => (
          <div key={row.label} className={styles.statusRow} data-testid={`connection-${row.label}`} data-state={row.state}>
            <dt>{row.label}</dt>
            <dd>
              <span aria-hidden="true">{row.copy.icon} </span>
              {row.copy.text}
              {row.hint ? <span className={styles.hint}> {row.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.hint}>This page cannot pair with or stream from the glasses.</p>
    </section>
  );
}
