// Expert companion state. Every control request stays pending until an
// authoritative SessionView (Ack value or subscribe push) reaches its target;
// a failure keeps the previous state. Unchanged input returns the same object,
// so callers can tell whether an event was accepted.
import { eventToEvidence } from "@/lib/companion/eventToEvidence";
import type { PointingEvent } from "@/lib/expert/contracts";
import type { CompanionEvent, ConnectionState, RecordingState, SessionView } from "@/lib/ui/contracts";

export const MAX_RECENT_EVENTS = 6;

export type RequestKind = "off_record" | "pause" | "stop";
/** off_record: true = go off record; pause: true = pause, false = resume; stop: always true. */
export type Pending = Partial<Record<RequestKind, boolean>>;

export type CompanionMachineState = {
  session: SessionView | null;
  /** Newest first. */
  events: CompanionEvent[];
  pending: Pending;
  errors: Partial<Record<RequestKind, string>>;
  connection: ConnectionState;
};

export type CompanionAction =
  | { type: "SESSION_LOADED"; session: SessionView }
  | { type: "SOURCE_SESSION"; session: SessionView }
  | { type: "ACKED"; kind: RequestKind; session: SessionView }
  | { type: "ACK_FAILED"; kind: RequestKind; error: string }
  | { type: "REQUESTED"; kind: RequestKind; target: boolean }
  | { type: "POINTING_EVENT"; event: PointingEvent }
  | { type: "CONNECTION"; state: ConnectionState }
  | { type: "RESYNCED"; session: SessionView; events: PointingEvent[] };

export const initialCompanionState = (): CompanionMachineState => ({
  session: null,
  events: [],
  pending: {},
  errors: {},
  connection: "unknown",
});

export function reached(session: SessionView, kind: RequestKind, target: boolean): boolean {
  switch (kind) {
    case "off_record":
      return session.recording_state === (target ? "off_record" : "on_record");
    case "pause":
      return session.lifecycle === (target ? "paused" : "active");
    case "stop":
      return session.lifecycle === "ended";
  }
}

const isStale = (current: SessionView | null, next: SessionView) =>
  current !== null && (next.rev ?? 0) < (current.rev ?? 0);

function withSession(state: CompanionMachineState, session: SessionView): CompanionMachineState {
  if (isStale(state.session, session)) return state;
  const pending: Pending = {};
  const errors = { ...state.errors };
  if (session.lifecycle !== "ended") {
    for (const kind of Object.keys(state.pending) as RequestKind[]) {
      const target = state.pending[kind]!;
      if (reached(session, kind, target)) delete errors[kind];
      else pending[kind] = target;
    }
  }
  return { ...state, session, pending, errors };
}

function addEvents(list: CompanionEvent[], incoming: PointingEvent[]): CompanionEvent[] {
  let events = list;
  for (const e of incoming) {
    if (events.some(x => x.event_id === e.event_id)) continue;
    events = [eventToEvidence(e), ...events].slice(0, MAX_RECENT_EVENTS);
  }
  return events;
}

export function companionMachine(state: CompanionMachineState, action: CompanionAction): CompanionMachineState {
  switch (action.type) {
    case "SESSION_LOADED":
    case "SOURCE_SESSION":
    case "ACKED":
      return withSession(state, action.session);

    case "ACK_FAILED": {
      if (state.pending[action.kind] === undefined) return state; // already resolved or ended
      const pending = { ...state.pending };
      delete pending[action.kind];
      return { ...state, pending, errors: { ...state.errors, [action.kind]: action.error } };
    }

    case "REQUESTED": {
      const { session } = state;
      if (!session || session.lifecycle === "ended") return state;
      if (state.pending[action.kind] !== undefined) return state;
      if (reached(session, action.kind, action.target)) return state;
      const errors = { ...state.errors };
      delete errors[action.kind];
      return { ...state, pending: { ...state.pending, [action.kind]: action.target }, errors };
    }

    case "POINTING_EVENT": {
      const events = addEvents(state.events, [action.event]);
      return events === state.events ? state : { ...state, events };
    }

    case "CONNECTION":
      return action.state === state.connection ? state : { ...state, connection: action.state };

    case "RESYNCED": {
      const synced = withSession(state, action.session);
      return { ...synced, events: addEvents([], action.events), connection: "connected" };
    }
  }
}

/** The recording state to show: a pending request wins over the last acknowledged state. */
export function displayRecording(state: CompanionMachineState): RecordingState | null {
  if (state.pending.off_record === true) return "off_record_pending";
  if (state.pending.off_record === false) return "on_record_pending";
  return state.session?.recording_state ?? null;
}
