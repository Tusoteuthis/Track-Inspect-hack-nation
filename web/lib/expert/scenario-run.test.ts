// Drives the reducer and the release planner through the default fixture scenario
// with a scripted expert (speech intervals, answers) and a scripted agent that only
// reacts to releases, the way useExpertSession's tick does. A logic check of the
// acceptance counts — not a substitute for the live human gate.
import { describe, expect, it } from "vitest";
import { FIXTURE_EVENTS } from "./fixtures";
import { DEFAULT_SCENARIO } from "./scenario";
import { type SessionAction, type SessionState, initialSession, injectFixture, reduceSession, toSnapshot } from "./session";
import { exchangeTimings, liveCounters } from "./timing";
import { planRelease } from "./topics";

const SID = "ses-20261004-020000-scen";
const TICK = 200;
const END = 170_000;
const at = (ms: number) => ({ at_utc: new Date(Date.UTC(2026, 9, 4, 2) + ms).toISOString(), perf_ms: ms });

type Timed = { ms: number; action: (s: SessionState) => SessionAction | null };

/** Expert speech intervals [start, end] and the final line spoken at the end of some of them. */
const SPEECH: [number, number, string | null][] = [
  [0, 12_000, "So this is the first thing I check, this spike up here on the upper channel."],
  [16_000, 22_000, "That spike is usually from the wheel set passing a gap. Twice the amplitude, very narrow."],
  [26_000, 30_000, "If both channels show it at the same moment I stop and call the measurement team."],
  [60_000, 95_000, "Now the lower channel. This slow drift creeps up and stays, I keep an eye on that."],
  [99_000, 104_000, "It starts when the train enters the section and I compare it with the previous run."],
  [135_000, 150_000, "And here, this whole area, that's what makes me slow down."],
  [156_000, 158_000, "I mean both channels together at that point."],
];

function script(): Timed[] {
  const timed: Timed[] = [];
  const fixture = (id: string) => injectFixture(FIXTURE_EVENTS.find(f => f.event_id === id)!, SID);
  for (const step of DEFAULT_SCENARIO) {
    timed.push({ ms: step.offset_s * 1000, action: () => ({ type: "event_received", event: fixture(step.event_id), ...at(step.offset_s * 1000) }) });
  }
  let line = 0;
  for (const [start, end, text] of SPEECH) {
    timed.push({ ms: start, action: () => ({ type: "user_speech_changed", speaking: true, ...at(start) }) });
    timed.push({ ms: end, action: () => ({ type: "user_speech_changed", speaking: false, ...at(end) }) });
    if (text) timed.push({ ms: end + 100, action: () => ({ type: "user_final_line", line_id: `u${++line}`, text, ...at(end + 100) }) });
  }
  return timed;
}

/** The agent asks `kind` about `eventId` at `ms` and speaks for 1.5 s. */
function agentAsks(ms: number, eventId: string, kind: string, text: string): Timed[] {
  return [
    { ms, action: () => ({ type: "question_begun", params: { event_id: eventId, kind, question: text }, ...at(ms) }) },
    { ms: ms + 200, action: () => ({ type: "agent_speaking_changed", speaking: true, ...at(ms + 200) }) },
    { ms: ms + 1500, action: () => ({ type: "agent_final_line", line_id: `a${ms}`, text, ...at(ms + 1500) }) },
    { ms: ms + 1700, action: () => ({ type: "agent_speaking_changed", speaking: false, ...at(ms + 1700) }) },
  ];
}

/**
 * Ticks every 200 ms like the console; `extra` adds agent turns the agent takes on its
 * own (follow-ups). For the ambiguous event the scripted agent first tries a plain
 * question (the tool rejects it), then clarifies.
 */
function simulate(extra: Timed[] = []) {
  let s = initialSession(SID, at(0).at_utc);
  const pending: Timed[] = [...script(), ...extra];
  const releases: { topic_id: string; ms: number; quiet_ms: number }[] = [];
  let speaking = false;
  let lastSpeech = Number.NEGATIVE_INFINITY;

  for (let now = 0; now <= END; now += TICK) {
    for (;;) {
      pending.sort((a, b) => a.ms - b.ms);
      if (!pending.length || pending[0].ms > now) break;
      const a = pending.shift()!.action(s);
      if (!a) continue;
      if (a.type === "user_speech_changed") {
        speaking = a.speaking;
        lastSpeech = a.perf_ms;
      }
      s = reduceSession(s, a);
    }

    const quiet_ms = speaking ? 0 : now - lastSpeech;
    const d = planRelease(s, { agent_speaking: s.agent_speaking, user_speaking: speaking, quiet_ms }, now, s.interview_config);
    if (d.kind === "release") {
      s = reduceSession(s, { type: "topic_released", topic_id: d.topic_id, stale: d.stale, ...at(now) });
      releases.push({ topic_id: d.topic_id, ms: now, quiet_ms });
      const topic = s.topics.find(t => t.topic_id === d.topic_id)!;
      if (topic.requires_clarification) {
        pending.push(agentAsks(now + 300, topic.primary_event_id, "explain", "What is going on there?")[0]);
        pending.push(...agentAsks(now + 600, topic.primary_event_id, "clarify_reference", "Which part do you mean, the upper channel, the lower one, or both?"));
      } else {
        pending.push(...agentAsks(now + 300, topic.primary_event_id, "explain", "What do you recognise in this region?"));
      }
    } else if (d.kind === "defer") {
      s = reduceSession(s, { type: "topics_deferred", topic_ids: d.topic_ids, reason: d.reason, ...at(now) });
    }
  }
  return { s, releases };
}

// The agent's own guardrail follow-up after the expert's first answer (its natural turn).
const FOLLOW_UP = agentAsks(23_800, "evt-001", "guardrail", "When would you stop and ask someone else about that spike?");

describe("fixture scenario (simulated expert and agent)", () => {
  const { s, releases } = simulate(FOLLOW_UP);

  it("releases only at pauses ≥ pause_ms, one topic at a time", () => {
    expect(releases.map(r => r.topic_id)).toEqual(["top-001", "top-002", "top-003"]);
    for (const r of releases) expect(r.quiet_ms).toBeGreaterThanOrEqual(s.interview_config.pause_ms);
  });

  it("merges evt-003 into evt-001's topic and never asks about it separately", () => {
    expect(s.topics[0]).toMatchObject({ primary_event_id: "evt-001", alias_event_ids: ["evt-003"] });
    expect(s.events.map(e => e.event_id)).toContain("evt-003");
    expect(s.exchanges.some(x => x.event_id === "evt-003")).toBe(false);
  });

  it("asks evt-004 with clarify_reference first (the plain first attempt is rejected)", () => {
    const evt4 = s.exchanges.filter(x => x.event_id === "evt-004");
    expect(evt4.map(x => x.kind)).toEqual(["clarify_reference"]);
  });

  it("keeps fixture labels and separates processing latency from intentional wait", () => {
    expect(s.exchanges.every(x => x.source === "fixture")).toBe(true);
    const first = exchangeTimings(toSnapshot(s))[0];
    expect(first.processing_ms).toBe(0);
    expect(first.intentional_wait_ms).toBeGreaterThanOrEqual(12_000 + s.interview_config.pause_ms);
  });

  it("meets the live acceptance counts", () => {
    const c = liveCounters(toSnapshot(s));
    expect(c).toMatchObject({ guardrail_questions: 1, duplicate_questions: 0, interruptions: 0, unlinked_agent_questions: 0 });
    expect(c.live_questions).toBeGreaterThanOrEqual(3);
  });

  it("without the follow-up there is no guardrail question: the live gate must show the agent asks one", () => {
    expect(liveCounters(toSnapshot(simulate().s)).guardrail_questions).toBe(0);
  });
});
