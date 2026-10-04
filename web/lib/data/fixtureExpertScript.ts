// Scripted expert session for fixture mode: a timed replay of the WS3 pointing
// fixtures plus simulated acknowledgements for start/pause/off-record/stop and
// a connection drop/restore. One script per source instance, so tests and
// pages never share session state.
import evt001 from "@/fixtures/pointing-events/evt-001-resolved.json";
import evt003 from "@/fixtures/pointing-events/evt-003-repeat-of-001.json";
import evt004 from "@/fixtures/pointing-events/evt-004-ambiguous.json";
import type { PointingEvent } from "@/lib/expert/contracts";
import { holdPointingEvent } from "@/lib/monitor/holdEvidence";
import { acknowledged, failed, type Ack, type SourceUpdate } from "@/lib/data/source";
import type { MediaHold, SessionView } from "@/lib/ui/contracts";

/** Resolved → repeat of the same spot → ambiguous. */
export const REPLAY_EVENTS = [evt001, evt003, evt004] as PointingEvent[];

export type ExpertScriptOptions = {
  session: SessionView;
  caseIds: string[];
  /** Video cases: pointing follows the monitor's holds instead of the timed replay. */
  mediaCaseIds?: string[];
  latencyMs: number;
  replayMs: number;
  fail?: { offRecord?: boolean; pause?: boolean; stop?: boolean };
};

export type ExpertScriptControls = {
  /** Live updates stop arriving; subscribers see "reconnecting". */
  dropConnection(): void;
  /** Subscribers see "connected" and are expected to resync. */
  restore(): void;
  connected(): boolean;
  /**
   * Simulated pointing at a monitor hold (video cases). Emits once per hold and
   * session, only while the session is active. Returns whether an event was emitted.
   */
  pointAtHold(hold: MediaHold): boolean;
};

const FAIL_TEXT = "Simulated failure (fixture): the request was not confirmed.";

export function createExpertScript(options: ExpertScriptOptions) {
  const { latencyMs, replayMs, caseIds } = options;
  const mediaCaseIds = options.mediaCaseIds ?? [];
  let startedAt = 0;
  const fail = options.fail ?? {};
  let session: SessionView = { ...structuredClone(options.session), rev: options.session.rev ?? 0 };
  const delivered: PointingEvent[] = [];
  let nextEvent = 0;
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let connected = true;
  const listeners = new Set<{ sessionId: string; onUpdate: (u: SourceUpdate) => void }>();

  const emit = (u: SourceUpdate, evenIfDisconnected = false) => {
    if (!connected && !evenIfDisconnected) return;
    for (const l of listeners) if (l.sessionId === session.session_id) l.onUpdate(structuredClone(u));
  };

  const scheduleReplay = () => {
    if (replayTimer || nextEvent >= REPLAY_EVENTS.length || session.lifecycle !== "active") return;
    if (session.case_id && mediaCaseIds.includes(session.case_id)) return;
    replayTimer = setTimeout(() => {
      replayTimer = null;
      // Capture is held while paused or after the end: nothing new is pointed at.
      if (session.lifecycle !== "active") return;
      const event = structuredClone(REPLAY_EVENTS[nextEvent++]);
      delivered.push(event);
      emit({ type: "pointing_event", event });
      scheduleReplay();
    }, replayMs);
  };
  const stopReplay = () => {
    if (replayTimer) clearTimeout(replayTimer);
    replayTimer = null;
  };

  /** Applies a change after the simulated latency; the push precedes the ack, like an SSE event racing a 200. */
  const act = (
    shouldFail: boolean | undefined,
    change: (s: SessionView) => SessionView | string
  ): Promise<Ack<SessionView>> =>
    new Promise(resolve => {
      setTimeout(() => {
        if (shouldFail) return resolve(failed(FAIL_TEXT));
        const next = change(session);
        if (typeof next === "string") return resolve(failed(next));
        session = { ...next, rev: (session.rev ?? 0) + 1 };
        emit({ type: "session", session });
        if (session.lifecycle === "active") scheduleReplay();
        else stopReplay();
        resolve(acknowledged(structuredClone(session)));
      }, latencyMs);
    });

  const known = (sessionId: string) => sessionId === session.session_id;
  const ended = "This session has already ended.";
  const unknownSession = "Unknown session.";

  const controls: ExpertScriptControls = {
    dropConnection() {
      if (!connected) return;
      emit({ type: "connection", state: "reconnecting" });
      connected = false;
    },
    restore() {
      if (connected) return;
      connected = true;
      emit({ type: "connection", state: "connected" });
    },
    connected: () => connected,
    pointAtHold(hold) {
      if (session.lifecycle !== "active" || !session.case_id) return false;
      const event = holdPointingEvent({
        sessionId: session.session_id,
        caseId: session.case_id,
        hold,
        sessionTimeMs: Date.now() - startedAt,
        now: new Date(),
      });
      if (!event || delivered.some(e => e.event_id === event.event_id)) return false;
      delivered.push(event);
      emit({ type: "pointing_event", event });
      return true;
    },
  };

  return {
    controls,
    getSession: async (sessionId: string): Promise<SessionView> => {
      if (!known(sessionId)) throw new Error(`Unknown session: ${sessionId}`);
      return structuredClone(session);
    },
    getRecentEvents: async (sessionId: string): Promise<PointingEvent[]> => {
      if (!known(sessionId)) throw new Error(`Unknown session: ${sessionId}`);
      return structuredClone(delivered);
    },
    startSession: (caseId: string) =>
      act(false, s => {
        if (!caseIds.includes(caseId)) return "Unknown case.";
        if (s.lifecycle === "ended") return ended;
        startedAt = Date.now();
        return { ...s, lifecycle: "active", case_id: caseId };
      }),
    requestOffRecord: (sessionId: string, offRecord: boolean) =>
      act(fail.offRecord, s =>
        !known(sessionId) ? unknownSession : s.lifecycle === "ended" ? ended : { ...s, recording_state: offRecord ? "off_record" : "on_record" }
      ),
    requestPause: (sessionId: string, paused: boolean) =>
      act(fail.pause, s =>
        !known(sessionId) ? unknownSession : s.lifecycle === "ended" ? ended : { ...s, lifecycle: paused ? "paused" : "active" }
      ),
    requestStop: (sessionId: string) =>
      act(fail.stop, s => (!known(sessionId) ? unknownSession : { ...s, lifecycle: "ended" })),
    subscribe(sessionId: string, onUpdate: (u: SourceUpdate) => void) {
      const entry = { sessionId, onUpdate };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
  };
}
