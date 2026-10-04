import { describe, expect, it } from "vitest";
import evt001 from "@/fixtures/pointing-events/evt-001-resolved.json";
import evt003 from "@/fixtures/pointing-events/evt-003-repeat-of-001.json";
import evt004 from "@/fixtures/pointing-events/evt-004-ambiguous.json";
import {
  companionMachine,
  displayRecording,
  initialCompanionState,
  MAX_RECENT_EVENTS,
  type CompanionMachineState,
} from "@/lib/companion/companionMachine";
import type { PointingEvent } from "@/lib/expert/contracts";
import type { SessionView } from "@/lib/ui/contracts";

const E1 = evt001 as PointingEvent;
const E3 = evt003 as PointingEvent;
const E4 = evt004 as PointingEvent;

const session = (patch: Partial<SessionView> = {}): SessionView => ({
  session_id: "s",
  role: "expert",
  lifecycle: "active",
  recording_state: "on_record",
  connection: { capture: "unknown", agent: "unknown", backend: "unknown" },
  case_id: "c",
  knowledge_revision_id: null,
  rev: 1,
  source: "fixture",
  ...patch,
});

const loaded = (patch: Partial<SessionView> = {}): CompanionMachineState =>
  companionMachine(initialCompanionState(), { type: "SESSION_LOADED", session: session(patch) });

describe("companionMachine: off-record (acknowledged state only)", () => {
  it("request → pending; displayed state is *_pending; session unchanged", () => {
    const s = companionMachine(loaded(), { type: "REQUESTED", kind: "off_record", target: true });
    expect(s.pending.off_record).toBe(true);
    expect(displayRecording(s)).toBe("off_record_pending");
    expect(s.session?.recording_state).toBe("on_record");
  });

  it("clears pending only when an authoritative session reaches the target", () => {
    let s = companionMachine(loaded(), { type: "REQUESTED", kind: "off_record", target: true });
    s = companionMachine(s, { type: "SOURCE_SESSION", session: session({ rev: 2 }) }); // unrelated update
    expect(displayRecording(s)).toBe("off_record_pending");
    s = companionMachine(s, { type: "SOURCE_SESSION", session: session({ rev: 3, recording_state: "off_record" }) });
    expect(s.pending.off_record).toBeUndefined();
    expect(displayRecording(s)).toBe("off_record");
  });

  it("an Ack value counts as authoritative too", () => {
    let s = companionMachine(loaded(), { type: "REQUESTED", kind: "off_record", target: true });
    s = companionMachine(s, { type: "ACKED", kind: "off_record", session: session({ rev: 2, recording_state: "off_record" }) });
    expect(displayRecording(s)).toBe("off_record");
  });

  it("failure keeps the previous state and records the error", () => {
    let s = companionMachine(loaded(), { type: "REQUESTED", kind: "off_record", target: true });
    s = companionMachine(s, { type: "ACK_FAILED", kind: "off_record", error: "nope" });
    expect(displayRecording(s)).toBe("on_record");
    expect(s.errors.off_record).toBe("nope");
    expect(s.pending.off_record).toBeUndefined();
  });

  it("a new request clears the previous error; a duplicate request is ignored", () => {
    let s = companionMachine(loaded(), { type: "REQUESTED", kind: "off_record", target: true });
    s = companionMachine(s, { type: "ACK_FAILED", kind: "off_record", error: "nope" });
    s = companionMachine(s, { type: "REQUESTED", kind: "off_record", target: true });
    expect(s.errors.off_record).toBeUndefined();
    expect(companionMachine(s, { type: "REQUESTED", kind: "off_record", target: false })).toBe(s);
  });

  it("ignores a request for a state already reached", () => {
    const s = loaded({ recording_state: "off_record" });
    expect(companionMachine(s, { type: "REQUESTED", kind: "off_record", target: true })).toBe(s);
  });

  it("back on record shows on_record_pending", () => {
    const s = companionMachine(loaded({ recording_state: "off_record" }), { type: "REQUESTED", kind: "off_record", target: false });
    expect(displayRecording(s)).toBe("on_record_pending");
  });
});

describe("companionMachine: stale updates, pause and stop", () => {
  it("ignores session updates with a lower rev", () => {
    const s = loaded({ rev: 5, recording_state: "off_record" });
    expect(companionMachine(s, { type: "SOURCE_SESSION", session: session({ rev: 4 }) })).toBe(s);
    expect(companionMachine(s, { type: "ACKED", kind: "off_record", session: session({ rev: 4 }) })).toBe(s);
  });

  it("pause and resume are pending until the lifecycle reaches the target", () => {
    let s = companionMachine(loaded(), { type: "REQUESTED", kind: "pause", target: true });
    expect(s.pending.pause).toBe(true);
    s = companionMachine(s, { type: "SOURCE_SESSION", session: session({ rev: 2, lifecycle: "paused" }) });
    expect(s.pending.pause).toBeUndefined();
    s = companionMachine(s, { type: "REQUESTED", kind: "pause", target: false });
    s = companionMachine(s, { type: "ACKED", kind: "pause", session: session({ rev: 3, lifecycle: "active" }) });
    expect([s.pending.pause, s.session?.lifecycle]).toEqual([undefined, "active"]);
  });

  it("stop is pending until ended; ended clears every pending request and ignores late results", () => {
    let s = companionMachine(loaded(), { type: "REQUESTED", kind: "off_record", target: true });
    s = companionMachine(s, { type: "REQUESTED", kind: "stop", target: true });
    expect(s.pending).toEqual({ off_record: true, stop: true });
    s = companionMachine(s, { type: "SOURCE_SESSION", session: session({ rev: 2, lifecycle: "ended" }) });
    expect(s.pending).toEqual({});
    expect(companionMachine(s, { type: "ACK_FAILED", kind: "off_record", error: "late" })).toBe(s);
    expect(companionMachine(s, { type: "REQUESTED", kind: "pause", target: true })).toBe(s);
  });

  it("requests need a loaded session", () => {
    const s = initialCompanionState();
    expect(companionMachine(s, { type: "REQUESTED", kind: "stop", target: true })).toBe(s);
  });
});

describe("companionMachine: events", () => {
  it("newest first, de-duplicated by event id, capped", () => {
    let s = loaded();
    for (const e of [E1, E3, E1, E4]) s = companionMachine(s, { type: "POINTING_EVENT", event: e });
    expect(s.events.map(e => e.event_id)).toEqual(["evt-004", "evt-003", "evt-001"]);
    for (let i = 0; i < 10; i++) {
      s = companionMachine(s, { type: "POINTING_EVENT", event: { ...E1, event_id: `x-${i}` } });
    }
    expect(s.events).toHaveLength(MAX_RECENT_EVENTS);
    expect(s.events[0].event_id).toBe("x-9");
  });

  it("a duplicate event leaves the state unchanged", () => {
    const s = companionMachine(loaded(), { type: "POINTING_EVENT", event: E1 });
    expect(companionMachine(s, { type: "POINTING_EVENT", event: E1 })).toBe(s);
  });
});

describe("companionMachine: connection and resync", () => {
  it("tracks the connection state", () => {
    const s = companionMachine(loaded(), { type: "CONNECTION", state: "reconnecting" });
    expect(s.connection).toBe("reconnecting");
  });

  it("resync replaces session and events and marks connected; reached pending items clear", () => {
    let s = companionMachine(loaded(), { type: "POINTING_EVENT", event: E1 });
    s = companionMachine(s, { type: "REQUESTED", kind: "off_record", target: true });
    s = companionMachine(s, { type: "CONNECTION", state: "reconnecting" });
    s = companionMachine(s, {
      type: "RESYNCED",
      session: session({ rev: 4, recording_state: "off_record" }),
      events: [E1, E3, E4],
    });
    expect(s.connection).toBe("connected");
    expect(s.events.map(e => e.event_id)).toEqual(["evt-004", "evt-003", "evt-001"]);
    expect(displayRecording(s)).toBe("off_record");
  });

  it("resync with an older session keeps the newer one but still takes the events", () => {
    let s = loaded({ rev: 9, recording_state: "off_record" });
    s = companionMachine(s, { type: "RESYNCED", session: session({ rev: 2 }), events: [E1] });
    expect(s.session?.recording_state).toBe("off_record");
    expect(s.events).toHaveLength(1);
  });
});
