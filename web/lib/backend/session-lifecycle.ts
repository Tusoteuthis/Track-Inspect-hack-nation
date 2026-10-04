/**
 * Pure session state machine (no I/O). created → active → ended; created | active → aborted;
 * ended and aborted are terminal. Re-sending an action whose target state is already reached
 * is an idempotent no-op, so retried lifecycle calls never fail.
 */
import type { LifecycleAction, LifecycleRequest, RecordState, Session, SessionLifecycle } from "@/lib/contracts";
import { ApiError } from "./errors";

export type Applied = { changed: boolean; session: Session };

const TARGET: Record<LifecycleAction, SessionLifecycle> = { start: "active", end: "ended", abort: "aborted" };

const ALLOWED: Record<SessionLifecycle, readonly LifecycleAction[]> = {
  created: ["start", "abort"],
  active: ["end", "abort"],
  ended: [],
  aborted: [],
};

export function isTerminal(lifecycle: SessionLifecycle): boolean {
  return lifecycle === "ended" || lifecycle === "aborted";
}

function closeOpenSegments(session: Session, at: string): Session["recording_segments"] {
  return session.recording_segments.map((s) => (s.ended_at_utc === null ? { ...s, ended_at_utc: at } : s));
}

export function applyLifecycle(session: Session, req: LifecycleRequest, now: Date): Applied {
  const target = TARGET[req.action];
  if (session.lifecycle === target) return { changed: false, session };
  if (req.rev !== session.rev) {
    throw new ApiError("stale_revision", "Session revision is not current.", {
      current_rev: session.rev,
      received_rev: req.rev,
    });
  }
  if (!ALLOWED[session.lifecycle].includes(req.action)) {
    throw new ApiError("invalid_transition", `Cannot ${req.action} a session that is ${session.lifecycle}.`, {
      from: session.lifecycle,
      action: req.action,
    });
  }
  const at = now.toISOString();
  return {
    changed: true,
    session: {
      ...session,
      lifecycle: target,
      recording_segments: isTerminal(target) ? closeOpenSegments(session, at) : session.recording_segments,
      rev: session.rev + 1,
    },
  };
}

/**
 * `sinceUtc` (off_record only, S4) backdates the new off-record segment into the current on-record
 * segment: "that last part was off the record". The caller then purges what was stored since.
 */
export function applyRecordState(session: Session, state: RecordState, now: Date, segmentId: string, sinceUtc?: string): Applied {
  if (isTerminal(session.lifecycle)) {
    throw new ApiError("invalid_transition", `Cannot change record state of a session that is ${session.lifecycle}.`, {
      from: session.lifecycle,
    });
  }
  if (session.record_state === state) return { changed: false, session };
  let at = now.toISOString();
  if (sinceUtc !== undefined) {
    const open = session.recording_segments.find(s => s.ended_at_utc === null);
    const since = Date.parse(sinceUtc);
    if (!open || since < Date.parse(open.started_at_utc) || since > now.getTime()) {
      throw new ApiError("validation_failed", "since_utc must lie inside the current on-record segment.", {
        field: "since_utc",
        segment_started_at_utc: open?.started_at_utc ?? null,
      });
    }
    at = new Date(since).toISOString();
  }
  return {
    changed: true,
    session: {
      ...session,
      record_state: state,
      recording_segments: [
        ...closeOpenSegments(session, at),
        { segment_id: segmentId, state, started_at_utc: at, ended_at_utc: null },
      ],
      rev: session.rev + 1,
    },
  };
}
