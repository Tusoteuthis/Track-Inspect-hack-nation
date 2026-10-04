import { describe, expect, it } from "vitest";
import { validateSessionSnapshot } from "./contracts";
import { selectGaps } from "./coverage";
import { fallbackProposal } from "./draft";
import { OFF_RECORD_REFUSAL, currentRecordState, detectRecordPhrase } from "./record-state";
import { toSnapshot } from "./session";
import { planRelease } from "./topics";
import { driver } from "./test-driver";

const SENTINEL = "pineapple calibration";
const has = (v: unknown, needle = SENTINEL) => JSON.stringify(v).toLowerCase().includes(needle);
const quiet = { agent_speaking: false, user_speaking: false, quiet_ms: 60_000 };

function liveSession() {
  const d = driver("ses-20261004-090000-off1");
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert("That spike is usually from the wheel set passing a gap.");
  return d;
}

describe("detectRecordPhrase", () => {
  it("finds off and on requests", () => {
    expect(detectRecordPhrase("Okay, off the record now.")).toEqual({ off: true, on: false });
    expect(detectRecordPhrase("Please stop recording for a second")).toEqual({ off: true, on: false });
    expect(detectRecordPhrase("Right, back on the record.")).toEqual({ off: false, on: true });
    expect(detectRecordPhrase("You can resume recording")).toEqual({ off: false, on: true });
    expect(detectRecordPhrase("That spike is on the left.")).toEqual({ off: false, on: false });
  });
});

describe("record state segments", () => {
  it("each change creates a segment with its trigger; the last segment is the acknowledged state", () => {
    const d = liveSession();
    expect(d.act({ type: "record_state_tool", params: { state: "off_record" } })).toMatch(/^ok record_state=off_record/);
    expect(currentRecordState(d.state)).toBe("off_record");
    d.act({ type: "record_state_changed", to: "on_record", trigger: "console" });
    const segs = d.state.recording_segments;
    expect(segs.map(s => [s.state, s.trigger])).toEqual([
      ["on_record", "session_start"],
      ["off_record", "agent_tool"],
      ["on_record", "console"],
    ]);
    expect(segs[0].ended_at_utc).toBe(segs[1].started_at_utc);
    expect(segs[1].ended_at_utc).toBe(segs[2].started_at_utc);
    expect(segs[2].ended_at_utc).toBeNull();
  });

  it("the agent tool is idempotent: it still returns the acknowledgement instruction", () => {
    const d = liveSession();
    d.expert("Off the record, please.");
    expect(currentRecordState(d.state)).toBe("off_record"); // phrase detected locally
    expect(d.act({ type: "record_state_tool", params: { state: "off" } })).toMatch(/Okay, off the record/);
    expect(d.state.recording_segments).toHaveLength(2);
  });

  it("rejects bad tool params", () => {
    expect(liveSession().act({ type: "record_state_tool", params: { state: "sideways" } })).toMatch(/^error/);
  });
});

describe("exclusion while off the record", () => {
  it("drops the triggering utterance retroactively and everything said until back on the record", () => {
    const d = liveSession();
    d.expert(`Hmm, off the record: the ${SENTINEL} on this line was never signed off.`);
    d.act({ type: "record_state_tool", params: { state: "off_record" } });
    d.agent("Okay, off the record.");
    d.expert(`Honestly the ${SENTINEL} is a mess.`);
    d.act({ type: "user_speech_changed", speaking: true });
    d.expert("Okay, back on the record.");
    expect(currentRecordState(d.state)).toBe("on_record");
    d.act({ type: "record_state_tool", params: { state: "on_record" } });
    d.agent("Okay, back on the record.");
    const snap = toSnapshot(d.state);
    expect(has(snap)).toBe(false);
    expect(snap.transcript.filter(t => t.role === "user" && /record/i.test(t.text))).toEqual([]);
    expect(snap.exchanges[0].answer_lines.map(l => l.text)).toEqual(["That spike is usually from the wheel set passing a gap."]);
    expect(snap.off_record_excluded.transcript_lines).toBeGreaterThanOrEqual(4);
    expect(snap.off_record_excluded.timing_marks).toBeGreaterThanOrEqual(1);
    expect(validateSessionSnapshot(snap)).toEqual({ ok: true, value: snap });
    // the agent's acknowledgement after going back on record is kept
    expect(snap.transcript.at(-1)?.text).toBe("Okay, back on the record.");
  });

  it("the off-record segment starts at the triggering utterance", () => {
    const d = liveSession();
    d.expert(`Off the record: ${SENTINEL}.`);
    const lineAt = d.state.recording_segments[1].started_at_utc;
    expect(currentRecordState(d.state)).toBe("off_record");
    d.act({ type: "record_state_tool", params: { state: "off_record" } });
    expect(d.state.recording_segments[1].started_at_utc).toBe(lineAt);
  });

  it("refuses questions and other recording tools while off the record", () => {
    const d = liveSession();
    d.act({ type: "record_state_changed", to: "off_record", trigger: "console" });
    expect(d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop?" })).toBe(OFF_RECORD_REFUSAL);
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "covered", note: "x" }] } })).toBe(OFF_RECORD_REFUSAL);
    expect(d.act({ type: "task_completed", trigger: "agent_tool" })).toBe(OFF_RECORD_REFUSAL);
    expect(d.state.exchanges).toHaveLength(1);
    expect(d.state.off_record_excluded.refused_tool_calls).toBe(3);
  });

  it("speech marks stamped back into a closed segment are dropped", () => {
    const d = liveSession();
    d.act({ type: "record_state_changed", to: "off_record", trigger: "console" });
    const offAt = d.state.recording_segments[1].started_at_utc;
    d.act({ type: "record_state_changed", to: "on_record", trigger: "console" });
    const before = d.state.timing.length;
    d.state = { ...d.state };
    const r = d.state;
    const next = d.reduce({ type: "user_speech_changed", speaking: false, at_utc: offAt, perf_ms: 1 });
    expect(next.timing.length).toBe(before);
    expect(next.off_record_excluded.timing_marks).toBe(r.off_record_excluded.timing_marks + 1);
  });
});

describe("off-record pointing events", () => {
  it("an off-record capture event switches the session off, is never stored, queued or released", () => {
    const d = liveSession();
    d.event("evt-005");
    expect(currentRecordState(d.state)).toBe("off_record");
    expect(d.state.recording_segments.at(-1)?.trigger).toBe("capture_event");
    expect(d.state.events.map(e => e.event_id)).toEqual(["evt-001"]);
    expect(d.state.topics.map(t => t.primary_event_id)).toEqual(["evt-001"]);
    expect(d.state.timing.some(m => m.event_id === "evt-005")).toBe(false);
    expect(d.state.off_record_excluded.events).toBe(1);
    expect(planRelease(d.state, quiet, 10_000_000, d.state.interview_config).kind).not.toBe("release");
  });

  it("on-record events arriving while off the record are dropped too", () => {
    const d = liveSession();
    d.act({ type: "record_state_changed", to: "off_record", trigger: "console" });
    d.event("evt-002");
    expect(d.state.events.map(e => e.event_id)).toEqual(["evt-001"]);
    expect(d.state.topics).toHaveLength(1);
  });

  it("a later on-record capture event ends a segment that a capture event started (only that kind)", () => {
    const d = liveSession();
    d.event("evt-005");
    d.event("evt-002");
    expect(currentRecordState(d.state)).toBe("on_record");
    expect(d.state.events.map(e => e.event_id)).toEqual(["evt-001", "evt-002"]);

    const v = liveSession();
    v.act({ type: "record_state_changed", to: "off_record", trigger: "console" });
    v.event("evt-002");
    expect(currentRecordState(v.state)).toBe("off_record");
  });
});

describe("gap selector and draft builder never see off-record content", () => {
  it("an off-record answer to an open debrief gap leaves the gap open", () => {
    const d = liveSession();
    d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "partial", note: "spike" }] } });
    d.act({ type: "task_completed", trigger: "console" });
    const gap = d.state.debrief_agenda[0];
    d.ask({ event_id: gap.event_id ?? "none", kind: "gap", phase: "debrief", gap_id: gap.gap_id, question: "What could look similar?" });
    const asked = d.lastExchangeId();
    d.expert(`Off the record, ${SENTINEL} looks similar and we always ignore it.`);
    d.agent("Okay, off the record.");
    d.expert(`It is the ${SENTINEL}, every time.`);
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: asked, dimensions: [{ dimension: gap.dimension, status: "covered", note: "x" }] } })).toBe(OFF_RECORD_REFUSAL);
    d.expert("Back on the record.");
    // even once back on the record, the exchange holds no expert words, so it cannot cover anything
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: asked, dimensions: [{ dimension: gap.dimension, status: "covered", note: "x" }] } })).toMatch(/no answer from the expert/);
    expect(d.state.debrief_agenda.find(g => g.gap_id === gap.gap_id)?.state).toBe("asked");
    expect(selectGaps(d.state).map(g => g.gap_id)).toContain(gap.gap_id);
    expect(has(fallbackProposal(d.state))).toBe(false);
    expect(has(selectGaps(d.state))).toBe(false);
  });
});
