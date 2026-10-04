import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExpertScript, REPLAY_EVENTS } from "@/lib/data/fixtureExpertScript";
import type { SourceUpdate } from "@/lib/data/source";
import type { SessionView } from "@/lib/ui/contracts";

const SESSION: SessionView = {
  session_id: "fixture-session-001",
  role: "expert",
  lifecycle: "not_started",
  recording_state: "on_record",
  connection: { capture: "unknown", agent: "unknown", backend: "unknown" },
  case_id: "case-1",
  knowledge_revision_id: null,
  source: "fixture",
};
const SID = SESSION.session_id;

function setup(opts: Partial<Parameters<typeof createExpertScript>[0]> = {}) {
  const script = createExpertScript({ session: SESSION, caseIds: ["case-1"], latencyMs: 100, replayMs: 1000, ...opts });
  const updates: SourceUpdate[] = [];
  const unsubscribe = script.subscribe(SID, u => updates.push(u));
  return { script, updates, unsubscribe };
}

const types = (updates: SourceUpdate[]) =>
  updates.map(u => (u.type === "pointing_event" ? `event:${u.event.event_id}` : u.type === "connection" ? `conn:${u.state}` : u.type));

describe("fixtureExpertScript", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("replays resolved, repeat, ambiguous in order once the session is active", async () => {
    const { script, updates } = setup();
    vi.advanceTimersByTime(5000);
    expect(updates).toHaveLength(0); // not started: nothing replays

    const ack = script.startSession("case-1");
    await vi.advanceTimersByTimeAsync(100);
    expect((await ack).status).toBe("acknowledged");
    await vi.advanceTimersByTimeAsync(3000);
    expect(types(updates)).toEqual(["session", "event:evt-001", "event:evt-003", "event:evt-004"]);
    expect(REPLAY_EVENTS.map(e => e.mapping_status)).toEqual(["resolved", "resolved", "ambiguous"]);
  });

  it("pushes the acknowledged session (rev+1) before the ack resolves", async () => {
    const { script, updates } = setup();
    const p = script.requestOffRecord(SID, true);
    expect(updates).toHaveLength(0); // nothing before the simulated latency
    await vi.advanceTimersByTimeAsync(100);
    const ack = await p;
    expect(ack.status === "acknowledged" && ack.value.recording_state).toBe("off_record");
    const pushed = updates[0];
    expect(pushed.type === "session" && pushed.session.recording_state).toBe("off_record");
    expect(pushed.type === "session" && pushed.session.rev).toBe(1);
    expect((await script.getSession(SID)).recording_state).toBe("off_record");
  });

  it("fails requests when configured and keeps the state", async () => {
    const { script, updates } = setup({ fail: { offRecord: true, pause: true, stop: true } });
    const results = [script.requestOffRecord(SID, true), script.requestPause(SID, true), script.requestStop(SID)];
    await vi.advanceTimersByTimeAsync(100);
    for (const r of await Promise.all(results)) expect(r.status).toBe("failed");
    expect(updates).toHaveLength(0);
    const s = await script.getSession(SID);
    expect([s.recording_state, s.lifecycle]).toEqual(["on_record", "not_started"]);
  });

  it("pauses, resumes and stops; a stopped session refuses further changes", async () => {
    const { script } = setup();
    const start = script.startSession("case-1");
    await vi.advanceTimersByTimeAsync(100);
    await start;
    const pause = script.requestPause(SID, true);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pause).status === "acknowledged" && (await script.getSession(SID)).lifecycle).toBe("paused");
    const resume = script.requestPause(SID, false);
    await vi.advanceTimersByTimeAsync(100);
    await resume;
    expect((await script.getSession(SID)).lifecycle).toBe("active");
    const stop = script.requestStop(SID);
    await vi.advanceTimersByTimeAsync(100);
    await stop;
    expect((await script.getSession(SID)).lifecycle).toBe("ended");
    const late = script.requestOffRecord(SID, true);
    await vi.advanceTimersByTimeAsync(100);
    expect((await late).status).toBe("failed");
  });

  it("holds replay while paused", async () => {
    const { script, updates } = setup();
    const start = script.startSession("case-1");
    await vi.advanceTimersByTimeAsync(100);
    await start;
    const pause = script.requestPause(SID, true);
    await vi.advanceTimersByTimeAsync(100);
    await pause;
    await vi.advanceTimersByTimeAsync(5000);
    expect(types(updates).filter(t => t.startsWith("event"))).toEqual([]);
  });

  it("drop → events keep arriving silently; restore → connected and getRecentEvents has them", async () => {
    const { script, updates } = setup();
    const start = script.startSession("case-1");
    await vi.advanceTimersByTimeAsync(100);
    await start;
    script.controls.dropConnection();
    await vi.advanceTimersByTimeAsync(3000);
    expect(types(updates)).toEqual(["session", "conn:reconnecting"]);
    script.controls.restore();
    expect(types(updates)).toEqual(["session", "conn:reconnecting", "conn:connected"]);
    expect((await script.getRecentEvents(SID)).map(e => e.event_id)).toEqual(["evt-001", "evt-003", "evt-004"]);
  });

  it("instances do not share state, and unsubscribing stops pushes", async () => {
    const a = setup();
    const b = createExpertScript({ session: SESSION, caseIds: ["case-1"], latencyMs: 0, replayMs: 1000 });
    const p = a.script.requestOffRecord(SID, true);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect((await b.getSession(SID)).recording_state).toBe("on_record");
    a.unsubscribe();
    const q = a.script.requestOffRecord(SID, false);
    await vi.advanceTimersByTimeAsync(100);
    await q;
    expect(a.updates).toHaveLength(1);
  });

  it("rejects unknown sessions and cases", async () => {
    const { script } = setup({ latencyMs: 0 });
    await expect(script.getSession("nope")).rejects.toThrow(/unknown session/i);
    const ack = script.startSession("nope");
    await vi.advanceTimersByTimeAsync(0);
    expect((await ack).status).toBe("failed");
  });

  describe("video case: pointing follows the monitor holds", () => {
    const VIDEO = "fixture-case-video-001";
    const HOLD = {
      hold_id: "hold-2",
      at_ms: 12_400,
      frame_url: "/fixtures/video/hold-2.jpg",
      frame_width_px: 832,
      frame_height_px: 464,
    };
    const videoSetup = () => setup({ caseIds: ["case-1", VIDEO], mediaCaseIds: [VIDEO] });

    it("does not run the timed replay for a video case", async () => {
      const { script, updates } = videoSetup();
      void script.startSession(VIDEO);
      await vi.advanceTimersByTimeAsync(5000);
      expect(types(updates)).toEqual(["session"]);
    });

    it("emits one pointing event per hold while active, on the hold's frame", async () => {
      const { script, updates } = videoSetup();
      expect(script.controls.pointAtHold(HOLD)).toBe(false); // not started
      void script.startSession(VIDEO);
      await vi.advanceTimersByTimeAsync(100);
      expect(script.controls.pointAtHold(HOLD)).toBe(true);
      expect(script.controls.pointAtHold(HOLD)).toBe(false); // once per hold
      expect(types(updates)).toEqual(["session", "event:evt-hold-2"]);
      const pushed = updates[1];
      expect(pushed.type === "pointing_event" && pushed.event).toMatchObject({
        image_ref: "/fixtures/video/hold-2.jpg",
        media_time_ms: 12_400,
        hold_id: "hold-2",
      });
      expect(await script.getRecentEvents(SID)).toHaveLength(1);
    });

    it("emits nothing while paused", async () => {
      const { script } = videoSetup();
      void script.startSession(VIDEO);
      await vi.advanceTimersByTimeAsync(100);
      void script.requestPause(SID, true);
      await vi.advanceTimersByTimeAsync(100);
      expect(script.controls.pointAtHold(HOLD)).toBe(false);
    });
  });
});
