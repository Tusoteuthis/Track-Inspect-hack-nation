import { describe, expect, it } from "vitest";
import type { LifecycleAction, Session, SessionLifecycle } from "@/lib/contracts";
import { ApiError } from "./errors";
import { applyLifecycle, applyRecordState } from "./session-lifecycle";

const t0 = "2026-10-04T10:00:00.000Z";
const now = new Date("2026-10-04T10:05:00.000Z");

function session(lifecycle: SessionLifecycle, rev = 3): Session {
  return {
    session_id: "ses-1",
    role: "expert",
    lifecycle,
    record_state: "on_record",
    recording_segments: [{ segment_id: "seg-1", state: "on_record", started_at_utc: t0, ended_at_utc: null }],
    case_id: null,
    trace_ref: null,
    pinned_knowledge: null,
    source: "live",
    created_at_utc: t0,
    rev,
  };
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : "other";
  }
}

describe("applyLifecycle", () => {
  const legal: [SessionLifecycle, LifecycleAction, SessionLifecycle][] = [
    ["created", "start", "active"],
    ["created", "abort", "aborted"],
    ["active", "end", "ended"],
    ["active", "abort", "aborted"],
  ];
  it.each(legal)("%s + %s → %s, rev+1", (from, action, to) => {
    const r = applyLifecycle(session(from), { action, rev: 3 }, now);
    expect(r.changed).toBe(true);
    expect(r.session.lifecycle).toBe(to);
    expect(r.session.rev).toBe(4);
  });

  const illegal: [SessionLifecycle, LifecycleAction][] = [
    ["created", "end"],
    ["ended", "start"],
    ["ended", "abort"],
    ["aborted", "start"],
    ["aborted", "end"],
  ];
  it.each(illegal)("%s + %s → invalid_transition", (from, action) => {
    expect(codeOf(() => applyLifecycle(session(from), { action, rev: 3 }, now))).toBe("invalid_transition");
  });

  const noop: [SessionLifecycle, LifecycleAction][] = [
    ["active", "start"],
    ["ended", "end"],
    ["aborted", "abort"],
  ];
  it.each(noop)("%s + %s (already applied) → unchanged, any rev", (from, action) => {
    const s = session(from);
    const r = applyLifecycle(s, { action, rev: 1 }, now);
    expect(r.changed).toBe(false);
    expect(r.session).toBe(s);
  });

  it("rejects an outdated rev with stale_revision and reports current_rev", () => {
    try {
      applyLifecycle(session("created", 3), { action: "start", rev: 2 }, now);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("stale_revision");
      expect((err as ApiError).details).toMatchObject({ current_rev: 3 });
    }
  });

  it("closes the open recording segment on end and abort", () => {
    for (const action of ["end", "abort"] as const) {
      const r = applyLifecycle(session("active"), { action, rev: 3 }, now);
      expect(r.session.recording_segments[0].ended_at_utc).toBe(now.toISOString());
    }
    const started = applyLifecycle(session("created"), { action: "start", rev: 3 }, now);
    expect(started.session.recording_segments[0].ended_at_utc).toBeNull();
  });

  it("does not mutate the input", () => {
    const s = session("active");
    const snapshot = structuredClone(s);
    applyLifecycle(s, { action: "end", rev: 3 }, now);
    expect(s).toEqual(snapshot);
  });
});

describe("applyRecordState", () => {
  it("switching state closes the open segment and appends a new one", () => {
    const r = applyRecordState(session("active"), "off_record", now, "seg-2");
    expect(r.changed).toBe(true);
    expect(r.session.record_state).toBe("off_record");
    expect(r.session.rev).toBe(4);
    expect(r.session.recording_segments).toEqual([
      { segment_id: "seg-1", state: "on_record", started_at_utc: t0, ended_at_utc: now.toISOString() },
      { segment_id: "seg-2", state: "off_record", started_at_utc: now.toISOString(), ended_at_utc: null },
    ]);
  });

  it("same state is a no-op", () => {
    const s = session("active");
    const r = applyRecordState(s, "on_record", now, "seg-2");
    expect(r.changed).toBe(false);
    expect(r.session).toBe(s);
  });

  it("is allowed before start", () => {
    expect(applyRecordState(session("created"), "off_record", now, "seg-2").changed).toBe(true);
  });

  it.each(["ended", "aborted"] as const)("is refused on %s sessions", (lc) => {
    expect(codeOf(() => applyRecordState(session(lc), "off_record", now, "seg-2"))).toBe("invalid_transition");
  });
});
