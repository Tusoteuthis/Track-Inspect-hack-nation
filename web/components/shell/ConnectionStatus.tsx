"use client";

import { useEffect, useState } from "react";
import type { DataSource } from "@/lib/data/source";
import type { ConnectionState } from "@/lib/ui/contracts";

/** Latest live-update connection state the source reported for this session ("unknown" until it says). */
export function useConnectionState(source: DataSource, sessionId: string | null): ConnectionState {
  const [state, setState] = useState<{ key: string; value: ConnectionState }>({ key: "", value: "unknown" });
  const key = `${source.kind}:${sessionId ?? ""}`;
  useEffect(() => {
    if (!sessionId) return;
    return source.subscribe(sessionId, update => {
      if (update.type === "connection") setState({ key, value: update.state });
    });
  }, [key, sessionId, source]);
  return state.key === key ? state.value : "unknown";
}

const COPY: Partial<Record<ConnectionState, { icon: string; text: string }>> = {
  reconnecting: { icon: "⏳", text: "Reconnecting… live updates are paused; showing the last confirmed state." },
  disconnected: {
    icon: "⚠",
    text: "Disconnected: live updates have stopped; showing the last confirmed state. Reload the page to try again.",
  },
};

/**
 * The one connection banner every screen uses. Says nothing while connected or
 * unknown: "unknown" is never presented as connected, and fixture screens
 * already carry the FIXTURE banner.
 */
export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const copy = COPY[state];
  if (!copy) return null;
  return (
    <p className="connection-banner" role="status" data-testid={state} data-connection={state}>
      <span aria-hidden="true">{copy.icon} </span>
      {copy.text}
    </p>
  );
}

/** Subscribes and renders the banner for one session. */
export function SessionConnectionStatus({ source, sessionId }: { source: DataSource; sessionId: string | null }) {
  return <ConnectionStatus state={useConnectionState(source, sessionId)} />;
}
