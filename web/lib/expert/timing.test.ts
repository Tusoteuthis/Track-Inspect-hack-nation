import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import { type SessionAction, type SessionState, initialSession, injectFixture, reduceSession, toSnapshot } from "./session";
import { countInterruptions, exchangeTimings, liveCounters, renderTimingReportMd } from "./timing";

const SID = "ses-20261004-010000-abcd";
const fixture = (file: string): PointingEvent =>
  injectFixture(JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "pointing-events", file), "utf8")), SID);
const evt1 = fixture("evt-001-resolved.json");
const evt2 = fixture("evt-002-resolved-sys2.json");
const evt3 = fixture("evt-003-repeat-of-001.json");

// Explicit clock: every action carries its perf time in ms.
const at = (ms: number) => ({ at_utc: new Date(Date.UTC(2026, 9, 4, 1) + ms).toISOString(), perf_ms: ms });
let line = 0;
const A = {
  event: (e: PointingEvent, ms: number): SessionAction => ({ type: "event_received", event: e, ...at(ms) }),
  release: (topic_id: string, ms: number, stale = false): SessionAction => ({ type: "topic_released", topic_id, stale, ...at(ms) }),
  nudge: (topic_id: string, ms: number): SessionAction => ({ type: "topic_nudged", topic_id, ...at(ms) }),
  ask: (event_id: string, kind: string, ms: number): SessionAction => ({
    type: "question_begun",
    params: { event_id, kind, question: "Q?" },
    ...at(ms),
  }),
  speak: (speaking: boolean, ms: number): SessionAction => ({ type: "agent_speaking_changed", speaking, ...at(ms) }),
  agent: (text: string, ms: number): SessionAction => ({ type: "agent_final_line", line_id: `l${++line}`, text, ...at(ms) }),
  user: (text: string, ms: number): SessionAction => ({ type: "user_final_line", line_id: `l${++line}`, text, ...at(ms) }),
  expert: (speaking: boolean, ms: number): SessionAction => ({ type: "user_speech_changed", speaking, ...at(ms) }),
};
const run = (actions: SessionAction[]): SessionState =>
  actions.reduce(reduceSession, initialSession(SID, "2026-10-04T01:00:00.000Z"));

/** evt-001 at 0 (+ duplicate evt-003), released at 4000, asked, answered, guardrail follow-up; evt-002 asked unreleased. */
function session(): SessionState {
  return run([
    A.event(evt1, 0),
    A.event(evt3, 3000),
    A.expert(true, 500),
    A.expert(false, 2500),
    A.release("top-001", 4000),
    A.ask("evt-001", "explain", 4300),
    A.speak(true, 4500),
    A.agent("What do you recognise here?", 6000),
    A.speak(false, 6100),
    A.expert(true, 6500),
    A.user("That spike, usually harmless.", 9000),
    A.expert(false, 9200),
    A.ask("evt-001", "guardrail", 11_000),
    A.speak(true, 11_400),
    A.agent("When would you not trust it?", 13_000),
    A.speak(false, 13_100),
    A.user("When both channels show it.", 15_000),
    A.event(evt2, 20_000),
    A.release("top-002", 23_000),
    A.nudge("top-002", 25_500),
    A.ask("evt-002", "explain", 26_000),
    A.speak(true, 26_200),
    A.agent("And this lower one?", 27_000),
    A.speak(false, 27_100),
  ]);
}

describe("exchangeTimings", () => {
  it("separates processing latency, intentional wait and agent latency for a released topic", () => {
    const [first] = exchangeTimings(toSnapshot(session()));
    expect(first).toMatchObject({
      exchange_id: "ex-001",
      event_id: "evt-001",
      kind: "explain",
      follow_up: false,
      released: true,
      stale: false,
      nudged: false,
      processing_ms: 0,
      intentional_wait_ms: 4000,
      release_to_tool_ms: 300,
      tool_to_speech_ms: 200,
      release_to_speech_ms: 500,
    });
  });

  it("follow-ups have no release columns but keep tool→speech", () => {
    const rows = exchangeTimings(toSnapshot(session()));
    expect(rows[1]).toMatchObject({
      exchange_id: "ex-002",
      kind: "guardrail",
      follow_up: true,
      processing_ms: null,
      intentional_wait_ms: null,
      release_to_tool_ms: null,
      tool_to_speech_ms: 400,
    });
  });

  it("reports the nudge on the topic's first exchange", () => {
    const rows = exchangeTimings(toSnapshot(session()));
    expect(rows[2]).toMatchObject({ event_id: "evt-002", nudged: true, intentional_wait_ms: 3000, release_to_tool_ms: 3000 });
  });

  it("marks a question on a topic that was never released", () => {
    const s = run([A.event(evt1, 0), A.ask("evt-001", "explain", 1000)]);
    expect(exchangeTimings(toSnapshot(s))[0]).toMatchObject({
      released: false,
      processing_ms: 0,
      intentional_wait_ms: null,
      release_to_tool_ms: null,
      tool_to_speech_ms: null,
    });
  });

  it("processing latency is topic_queued minus event_received, never a wait", () => {
    const snap = toSnapshot(run([A.event(evt1, 100), A.release("top-001", 2100), A.ask("evt-001", "explain", 2200)]));
    // shift the queued mark to simulate slow processing
    snap.timing = snap.timing.map(m => (m.mark === "topic_queued" ? { ...m, at_perf_ms: 140 } : m));
    expect(exchangeTimings(snap)[0]).toMatchObject({ processing_ms: 40, intentional_wait_ms: 1960 });
  });
});

describe("countInterruptions", () => {
  it("is 0 when the agent only starts after the expert stopped", () => {
    expect(countInterruptions(toSnapshot(session()).timing).count).toBe(0);
  });

  it("counts agent speech that starts inside an expert speech interval", () => {
    const s = run([A.expert(true, 1000), A.speak(true, 1500), A.speak(false, 2000), A.expert(false, 2500), A.speak(true, 3000)]);
    const r = countInterruptions(s.timing);
    expect(r.count).toBe(1);
    expect(r.at_utc).toEqual([at(1500).at_utc]);
  });

  it("orders by time, so an end stamped earlier but logged later still closes the interval", () => {
    // the detector logs the end after the hold, stamped at the last activity
    const s = run([A.expert(true, 1000), A.speak(true, 1600), A.expert(false, 1400)]);
    expect(countInterruptions(s.timing).count).toBe(0);
  });
});

describe("liveCounters", () => {
  it("derives every counter from the stored records", () => {
    const snap = toSnapshot(session());
    expect(liveCounters(snap)).toEqual({
      live_questions: 3,
      guardrail_questions: 1,
      deferred_topics: 0,
      unlinked_agent_questions: 0,
      interruptions: 0,
      duplicate_questions: 0,
    });
  });

  it("counts deferred topics, unlinked questions and same-kind repeats on one topic", () => {
    const s = run([
      A.event(evt1, 0),
      A.event(evt2, 100),
      { type: "topics_deferred", topic_ids: ["top-002"], reason: "budget", ...at(200) },
      A.ask("evt-001", "explain", 1000),
      A.agent("What is it?", 1100),
      A.ask("evt-003", "explain", 2000), // unknown id, rejected (evt-003 never arrived)
      A.ask("evt-001", "explain", 3000),
      A.agent("What do you see?", 3100),
      A.agent("Anything else?", 3200),
    ]);
    expect(liveCounters(toSnapshot(s))).toMatchObject({
      live_questions: 2,
      deferred_topics: 1,
      unlinked_agent_questions: 1,
      duplicate_questions: 1,
    });
  });

  it("does not count questions that were never spoken", () => {
    const s = run([A.event(evt1, 0), A.ask("evt-001", "explain", 1000)]);
    expect(liveCounters(toSnapshot(s)).live_questions).toBe(0);
  });
});

describe("renderTimingReportMd", () => {
  it("has separate columns for processing latency and intentional wait, plus interruptions and counters", () => {
    const md = renderTimingReportMd(toSnapshot(session()));
    expect(md).toContain(`# Timing report — ${SID}`);
    expect(md).toContain("| exchange | event | kind | processing ms | intentional wait ms | release→tool ms | tool→speech ms | release→speech ms | notes |");
    expect(md).toContain("| ex-001 | evt-001 | explain | 0 | 4000 | 300 | 200 | 500 | FIXTURE |");
    expect(md).toContain("| ex-002 | evt-001 | guardrail | — | — | — | 400 | — | follow-up, FIXTURE |");
    expect(md).toContain("nudged");
    expect(md).toContain("Interruptions (agent speech started while the expert was speaking): 0");
    expect(md).toMatch(/pause_ms 1200/);
    expect(md).toContain("| top-001 | evt-001 | evt-003 | answered |");
    expect(md).toMatch(/silence is not proof/i);
  });
});
