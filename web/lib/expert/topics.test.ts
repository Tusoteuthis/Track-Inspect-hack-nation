import { describe, expect, it } from "vitest";
import type { PointingEvent, Region, TimingMark, Topic } from "./contracts";
import { DEFAULT_INTERVIEW_CONFIG as C, withConfig } from "./interview-config";
import {
  budgetState,
  ingestEvent,
  isStale,
  openTopic,
  planRelease,
  regionIoU,
  releaseText,
  type ReleaseSignals,
} from "./topics";

const SID = "ses-20261004-010000-abcd";
const box = (x: number, y: number, width: number, height: number): Region => ({
  x,
  y,
  width,
  height,
  coordinate_space: "original_frame_normalized",
  frame_width_px: 1600,
  frame_height_px: 900,
});
const R1 = box(0.2, 0.15, 0.15, 0.25);

function ev(id: string, over: Partial<PointingEvent> = {}): PointingEvent {
  return {
    schema_version: "ws3.v0",
    session_id: SID,
    event_id: id,
    source: "fixture",
    captured_at_utc: "2026-10-04T01:00:00.000Z",
    session_time_ms: 0,
    frame_id: `f-${id}`,
    image_ref: "/x.svg",
    highlighted_image_ref: "/x.svg",
    region: R1,
    mapping_status: "resolved",
    trace_id: "trace-A",
    channel_id: "SYS1",
    signal_interval: null,
    record_state: "on_record",
    ...over,
  };
}
const at = (perf_ms: number) => ({ at_utc: new Date(Date.UTC(2026, 9, 4, 1) + perf_ms).toISOString(), perf_ms });

/** Ingests events in order: [event, receive time]. */
function ingestAll(list: [PointingEvent, number][]) {
  let topics: Topic[] = [];
  const events: PointingEvent[] = [];
  const merged: boolean[] = [];
  for (const [e, t] of list) {
    events.push(e);
    const r = ingestEvent(topics, events, e, at(t), C, SID);
    topics = r.topics;
    merged.push(r.merged);
  }
  return { topics, events, merged };
}

describe("regionIoU", () => {
  it("is 1 for identical boxes and 0 for disjoint ones", () => {
    expect(regionIoU(R1, R1)).toBeCloseTo(1, 12);
    expect(regionIoU(R1, box(0.6, 0.6, 0.1, 0.1))).toBe(0);
  });

  it("computes intersection over union", () => {
    // two unit-width boxes overlapping by half: I = 0.5, U = 1.5
    expect(regionIoU(box(0, 0, 0.2, 0.2), box(0.1, 0, 0.2, 0.2))).toBeCloseTo(1 / 3, 10);
  });
});

describe("dedup (ingestEvent)", () => {
  it("merges a repeat gesture on the same channel and region into the first topic", () => {
    const { topics, merged } = ingestAll([
      [ev("evt-001"), 0],
      [ev("evt-003"), 8000],
    ]);
    expect(merged).toEqual([false, true]);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ primary_event_id: "evt-001", alias_event_ids: ["evt-003"], state: "queued" });
    expect(topics[0].last_event_at_perf_ms).toBe(8000);
  });

  it("window edge: exactly dedup_window_ms merges, one ms later does not", () => {
    expect(ingestAll([[ev("a"), 0], [ev("b"), C.dedup_window_ms]]).topics).toHaveLength(1);
    expect(ingestAll([[ev("a"), 0], [ev("b"), C.dedup_window_ms + 1]]).topics).toHaveLength(2);
  });

  it("the window is measured from the topic's latest event", () => {
    const { topics } = ingestAll([
      [ev("a"), 0],
      [ev("b"), 15_000],
      [ev("c"), 30_000],
    ]);
    expect(topics).toHaveLength(1);
    expect(topics[0].alias_event_ids).toEqual(["b", "c"]);
  });

  it("IoU edge: exactly 0.5 merges, just below does not", () => {
    // same height; widths chosen so I/U = 0.5 exactly: A=[0,0.3], B=[0.1,0.3] → I=0.2, U=0.3… use A=[0,0.2], B=[0,0.1]
    const a = box(0, 0, 0.2, 0.2);
    const half = box(0, 0, 0.1, 0.2); // I = 0.02, U = 0.04 → 0.5
    const less = box(0, 0, 0.098, 0.2);
    expect(regionIoU(a, half)).toBeCloseTo(0.5, 12);
    expect(ingestAll([[ev("a", { region: a }), 0], [ev("b", { region: half }), 1000]]).topics).toHaveLength(1);
    expect(ingestAll([[ev("a", { region: a }), 0], [ev("b", { region: less }), 1000]]).topics).toHaveLength(2);
  });

  it("never merges across channels; null channels merge with null", () => {
    expect(ingestAll([[ev("a"), 0], [ev("b", { channel_id: "SYS2" }), 1000]]).topics).toHaveLength(2);
    expect(ingestAll([[ev("a", { channel_id: null }), 0], [ev("b", { channel_id: null }), 1000]]).topics).toHaveLength(1);
    expect(ingestAll([[ev("a", { channel_id: null }), 0], [ev("b"), 1000]]).topics).toHaveLength(2);
  });

  it("never merges on-record with off-record; off-record topics are dropped, never queued", () => {
    const { topics } = ingestAll([
      [ev("a"), 0],
      [ev("b", { record_state: "off_record" }), 1000],
    ]);
    expect(topics.map(t => t.state)).toEqual(["queued", "dropped_off_record"]);
  });

  it("merges a repeat of a topic that was already asked/answered without changing its state", () => {
    const first = ingestAll([[ev("a"), 0]]);
    const answered = [{ ...first.topics[0], state: "answered" as const }];
    const r = ingestEvent(answered, [...first.events, ev("b")], ev("b"), at(5000), C, SID);
    expect(r.merged).toBe(true);
    expect(r.topics[0].state).toBe("answered");
  });

  it("flags ambiguous and unresolved topics as requiring clarification", () => {
    const { topics } = ingestAll([
      [ev("a", { mapping_status: "ambiguous", channel_id: null }), 0],
      [ev("b", { mapping_status: "unresolved", channel_id: "SYS2" }), 0],
      [ev("c", { channel_id: "SYS3" }), 0],
    ]);
    expect(topics.map(t => t.requires_clarification)).toEqual([true, true, false]);
  });
});

describe("staleness", () => {
  it("is stale after stale_after_ms since the topic's latest event", () => {
    const { topics } = ingestAll([[ev("a"), 0]]);
    expect(isStale(topics[0], topics, C.stale_after_ms, C)).toBe(false);
    expect(isStale(topics[0], topics, C.stale_after_ms + 1, C)).toBe(true);
  });

  it("is stale when a newer non-duplicate event arrived on another region", () => {
    const { topics } = ingestAll([
      [ev("a"), 0],
      [ev("b", { channel_id: "SYS2" }), 5000],
    ]);
    expect(isStale(topics[0], topics, 6000, C)).toBe(true);
    expect(isStale(topics[1], topics, 6000, C)).toBe(false);
  });

  it("a duplicate does not make the topic stale; it refreshes it", () => {
    const { topics } = ingestAll([
      [ev("a"), 0],
      [ev("b"), 15_000],
    ]);
    expect(isStale(topics[0], topics, 40_000, C)).toBe(false);
  });

  it("release text refers explicitly to the earlier moment when stale", () => {
    const { topics, events } = ingestAll([[ev("evt-001"), 0]]);
    const text = releaseText(topics[0], events, [], true);
    expect(text).toMatch(/^\[POINTING_EVENT\] event_id=evt-001 /);
    expect(text).toContain("stale=yes");
    expect(text).toContain('"the region you pointed at a moment ago on SYS1"');
    expect(releaseText(topics[0], events, [], false)).not.toContain("stale=yes");
  });
});

// --- release planning ----------------------------------------------------------

const quiet: ReleaseSignals = { agent_speaking: false, user_speaking: false, quiet_ms: 10_000 };

function topic(over: Partial<Topic>): Topic {
  return {
    topic_id: "top-001",
    session_id: SID,
    primary_event_id: "evt-001",
    alias_event_ids: [],
    state: "queued",
    requires_clarification: false,
    record_state: "on_record",
    channel_id: "SYS1",
    queued_at_utc: "2026-10-04T01:00:00.000Z",
    queued_at_perf_ms: 0,
    last_event_at_perf_ms: 0,
    released_at_utc: null,
    released_at_perf_ms: null,
    asked_at_perf_ms: null,
    stale_at_release: null,
    release_text: null,
    nudged_at_perf_ms: null,
    exchange_ids: [],
    deferred_reason: null,
    ...over,
  };
}
const mark = (name: TimingMark["mark"], perf: number): TimingMark => ({
  session_id: SID,
  event_id: null,
  exchange_id: null,
  mark: name,
  at_utc: at(perf).at_utc,
  at_perf_ms: perf,
});
const plan = (topics: Topic[], signals = quiet, now = 5000, timing: TimingMark[] = [], config = C) =>
  planRelease({ topics, timing }, signals, now, config);

describe("planRelease: gating", () => {
  it("releases the oldest queued topic when every condition holds", () => {
    const d = plan([topic({ topic_id: "top-002", queued_at_perf_ms: 200, last_event_at_perf_ms: 200, channel_id: "SYS2" }), topic({})]);
    expect(d).toMatchObject({ kind: "release", topic_id: "top-001" });
  });

  it("is blocked while the agent speaks", () => {
    expect(plan([topic({})], { ...quiet, agent_speaking: true })).toEqual({ kind: "wait", reasons: ["agent_speaking"] });
  });

  it("is blocked while the expert speaks", () => {
    expect(plan([topic({})], { ...quiet, user_speaking: true, quiet_ms: 0 })).toEqual({
      kind: "wait",
      reasons: ["user_speaking", "pause_not_reached"],
    });
  });

  it("is blocked until the expert has been quiet for pause_ms", () => {
    expect(plan([topic({})], { ...quiet, quiet_ms: C.pause_ms - 1 })).toEqual({ kind: "wait", reasons: ["pause_not_reached"] });
    expect(plan([topic({})], { ...quiet, quiet_ms: C.pause_ms }).kind).toBe("release");
  });

  it("waits when nothing is queued; off-record topics are never released", () => {
    expect(plan([])).toEqual({ kind: "wait", reasons: ["nothing_queued"] });
    expect(plan([topic({ state: "dropped_off_record", record_state: "off_record" })])).toEqual({
      kind: "wait",
      reasons: ["nothing_queued"],
    });
  });

  it("only one topic at a time: an unanswered released or asked topic blocks the next", () => {
    // queued before the first was released, so the expert has not moved on
    const next = topic({ topic_id: "top-002", queued_at_perf_ms: 40, channel_id: "SYS2" });
    const released = topic({ state: "released", released_at_perf_ms: 50, released_at_utc: at(50).at_utc });
    expect(plan([released, next], quiet, 1000)).toEqual({ kind: "wait", reasons: ["topic_open"] });
    const asked = topic({ state: "asked", released_at_perf_ms: 50, asked_at_perf_ms: 300 });
    expect(plan([asked, next], quiet, 1000)).toEqual({ kind: "wait", reasons: ["topic_open"] });
    const answered = topic({ state: "answered", released_at_perf_ms: 50, asked_at_perf_ms: 300 });
    expect(plan([answered, next], quiet, 1000)).toMatchObject({ kind: "release", topic_id: "top-002" });
  });

  it("an asked topic stops blocking once the expert moved on to a newer topic", () => {
    const asked = topic({ state: "asked", released_at_perf_ms: 50, asked_at_perf_ms: 60 });
    const next = topic({ topic_id: "top-002", queued_at_perf_ms: 100, channel_id: "SYS2" });
    expect(openTopic([asked, next])).toBeUndefined();
    expect(plan([asked, next], quiet, 1000)).toMatchObject({ kind: "release", topic_id: "top-002" });
  });

  it("a follow-up asked after the newer topic arrived blocks again", () => {
    const followUp = topic({ state: "asked", released_at_perf_ms: 50, asked_at_perf_ms: 500 });
    const next = topic({ topic_id: "top-002", queued_at_perf_ms: 100, channel_id: "SYS2" });
    expect(openTopic([followUp, next])?.topic_id).toBe("top-001");
  });

  it("flags staleness on release", () => {
    expect(plan([topic({})], quiet, C.stale_after_ms + 1)).toMatchObject({ kind: "release", stale: true });
    expect(plan([topic({})], quiet, 1000)).toMatchObject({ kind: "release", stale: false });
  });
});

describe("planRelease: released topics the agent did not ask about", () => {
  const released = topic({ state: "released", released_at_perf_ms: 1000, released_at_utc: at(1000).at_utc });

  it("defers it to the debrief when the expert moved on to a newer topic", () => {
    const next = topic({ topic_id: "top-002", queued_at_perf_ms: 2000, channel_id: "SYS2" });
    expect(plan([released, next], quiet, 2500)).toEqual({ kind: "defer", topic_ids: ["top-001"], reason: "moved_on" });
  });

  it("defers it after release_timeout_ms", () => {
    expect(plan([{ ...released, nudged_at_perf_ms: 3500 }], quiet, 1000 + C.release_timeout_ms)).toEqual({
      kind: "defer",
      topic_ids: ["top-001"],
      reason: "release_timeout",
    });
  });

  it("nudges once after nudge_after_ms if the agent has not acted and the gate still holds", () => {
    const now = 1000 + C.nudge_after_ms;
    expect(plan([released], quiet, now - 1)).toEqual({ kind: "wait", reasons: ["topic_open"] });
    expect(plan([released], quiet, now)).toEqual({ kind: "nudge", topic_id: "top-001" });
    expect(plan([{ ...released, nudged_at_perf_ms: now }], quiet, now + 100)).toEqual({ kind: "wait", reasons: ["topic_open"] });
  });

  it("does not nudge when the agent already started speaking or called the tool", () => {
    const now = 1000 + C.nudge_after_ms;
    expect(plan([released], quiet, now, [mark("agent_speech_started", 1500)]).kind).toBe("wait");
    expect(plan([released], quiet, now, [mark("question_tool_called", 1500)]).kind).toBe("wait");
    expect(plan([released], quiet, now, [mark("agent_speech_started", 900)]).kind).toBe("nudge");
  });

  it("does not nudge into speech or a short pause, nor when nudging is disabled", () => {
    const now = 1000 + C.nudge_after_ms;
    expect(plan([released], { ...quiet, user_speaking: true, quiet_ms: 0 }, now).kind).toBe("wait");
    expect(plan([released], { ...quiet, quiet_ms: C.pause_ms - 1 }, now).kind).toBe("wait");
    expect(plan([released], { ...quiet, agent_speaking: true }, now).kind).toBe("wait");
    expect(plan([released], quiet, now, [], withConfig({ nudge_after_ms: 0 })).kind).toBe("wait");
  });
});

describe("budget", () => {
  const asked = (n: number, start = 0) => Array.from({ length: n }, (_, i) => mark("question_tool_called", start + i * 1000));

  it("counts questions in the rolling window", () => {
    expect(budgetState(asked(3), 10_000, C)).toEqual({ used: 3, max: C.budget_max_questions, exhausted: false });
    expect(budgetState(asked(C.budget_max_questions), 10_000, C).exhausted).toBe(true);
    // all asked at 0..4 s; after the window they no longer count
    expect(budgetState(asked(C.budget_max_questions), C.budget_window_ms + 5000, C).used).toBe(0);
  });

  it("defers the next topic to the debrief when the budget is used up, never drops it", () => {
    const d = plan([topic({})], quiet, 10_000, asked(C.budget_max_questions));
    expect(d).toEqual({ kind: "defer", topic_ids: ["top-001"], reason: "budget" });
  });

  it("budget overflow is checked before the pause gate (expert still talking)", () => {
    const d = plan([topic({})], { ...quiet, user_speaking: true, quiet_ms: 0 }, 10_000, asked(C.budget_max_questions));
    expect(d.kind).toBe("defer");
  });

  it("releases again once the window frees up", () => {
    const d = plan([topic({ queued_at_perf_ms: C.budget_window_ms })], quiet, C.budget_window_ms + 5000, asked(C.budget_max_questions));
    expect(d.kind).toBe("release");
  });
});
