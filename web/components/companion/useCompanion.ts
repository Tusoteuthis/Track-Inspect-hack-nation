"use client";

// Binds the companion reducer to the data source. Requests go through the
// reducer first: a second press (or a StrictMode re-run) while one is pending
// is rejected there, so only one request is ever sent. After a dropped
// connection comes back, session and recent events are re-read (resync).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  companionMachine,
  initialCompanionState,
  type CompanionAction,
  type CompanionMachineState,
  type RequestKind,
} from "@/lib/companion/companionMachine";
import type { DataSource } from "@/lib/data/source";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useCompanion(source: DataSource, sessionId: string) {
  const ref = useRef<CompanionMachineState>(initialCompanionState());
  const [state, setState] = useState(ref.current);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const mounted = useRef(true);

  const apply = useCallback((action: CompanionAction): boolean => {
    if (!mounted.current) return false;
    const next = companionMachine(ref.current, action);
    if (next === ref.current) return false;
    ref.current = next;
    setState(next);
    return true;
  }, []);

  const resync = useCallback(async () => {
    setSyncing(true);
    try {
      const [session, events] = await Promise.all([source.getSession(sessionId), source.getRecentEvents(sessionId)]);
      apply({ type: "RESYNCED", session, events });
      setLoadError(null);
    } catch (e) {
      if (mounted.current) setLoadError(message(e));
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [apply, source, sessionId]);

  useEffect(() => {
    mounted.current = true;
    // Subscribe first, then read: nothing pushed in between is lost.
    const unsubscribe = source.subscribe(sessionId, update => {
      switch (update.type) {
        case "session":
          if (update.session.session_id === sessionId) apply({ type: "SOURCE_SESSION", session: update.session });
          return;
        case "pointing_event":
          if (update.event.session_id === sessionId) apply({ type: "POINTING_EVENT", event: update.event });
          return;
        case "connection": {
          const before = ref.current.connection;
          apply({ type: "CONNECTION", state: update.state });
          if (update.state === "connected" && (before === "reconnecting" || before === "disconnected")) void resync();
          return;
        }
        default:
          return;
      }
    });
    void resync();
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [apply, resync, source, sessionId]);

  const request = useCallback(
    (kind: RequestKind, target: boolean) => {
      if (!apply({ type: "REQUESTED", kind, target })) return;
      const call =
        kind === "off_record"
          ? source.requestOffRecord(sessionId, target)
          : kind === "pause"
            ? source.requestPause(sessionId, target)
            : source.requestStop(sessionId);
      call.then(
        ack =>
          ack.status === "acknowledged"
            ? apply({ type: "ACKED", kind, session: ack.value })
            : apply({ type: "ACK_FAILED", kind, error: ack.error }),
        e => apply({ type: "ACK_FAILED", kind, error: message(e) })
      );
    },
    [apply, source, sessionId]
  );

  return { state, loadError, syncing, request, resync };
}
