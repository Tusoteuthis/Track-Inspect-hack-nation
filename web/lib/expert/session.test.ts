import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type PointingEvent, validateSessionSnapshot } from "./contracts";
import {
  type SessionAction,
  type SessionState,
  initialSession,
  injectFixture,
  newSessionId,
  reduceSession,
  toSnapshot,
} from "./session";

const SID = "ses-20261004-010000-abcd";
const fixture = (file: string): PointingEvent =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "pointing-events", file), "utf8"));
const evt1 = injectFixture(fixture("evt-001-resolved.json"), SID);
const evt2 = injectFixture(fixture("evt-002-resolved-sys2.json"), SID);
const evt3 = injectFixture(fixture("evt-003-repeat-of-001.json"), SID);
const evt4 = injectFixture(fixture("evt-004-ambiguous.json"), SID);
const evt5 = injectFixture(fixture("evt-005-off-record.json"), SID);

// Deterministic clock: each action happens one second after the previous one.
function run(actions: SessionAction[], start: SessionState = initialSession(SID, "2026-10-04T01:00:00.000Z")) {
  return actions.reduce(reduceSession, start);
}
let tick = 0;
const t = () => {
  tick += 1;
  return { at_utc: new Date(Date.UTC(2026, 9, 4, 1, 0, tick)).toISOString(), perf_ms: tick * 1000 };
};
const event = (e: PointingEvent): SessionAction => ({ type: "event_received", event: e, ...t() });
const ask = (event_id: string | null, kind = "explain", question = "What do you recognize here?"): SessionAction => ({
  type: "question_begun",
  params: { event_id: event_id ?? "none", kind, question },
  ...t(),
});
let lineNo = 0;
const agent = (text: string): SessionAction => ({ type: "agent_final_line", line_id: `line-${++lineNo}`, text, ...t() });
const user = (text: string): SessionAction => ({ type: "user_final_line", line_id: `line-${++lineNo}`, text, ...t() });

describe("question ↔ event linkage", () => {
  it("creates a live exchange linked to the declared event and reports ok", () => {
    const s = run([event(evt1), ask("evt-001")]);
    expect(s.exchanges).toHaveLength(1);
    expect(s.exchanges[0]).toMatchObject({
      exchange_id: "ex-001",
      session_id: SID,
      event_id: "evt-001",
      phase: "live",
      kind: "explain",
      question: "",
      question_planned: "What do you recognize here?",
      answer_lines: [],
      record_state: "on_record",
      source: "fixture",
    });
    expect(s.active_exchange_id).toBe("ex-001");
    expect(s.last_tool_result).toBe("ok exchange_id=ex-001");
  });

  it("fills the question from the agent's next spoken line, verbatim", () => {
    const s = run([event(evt1), ask("evt-001"), agent("What do you see in this upper part, there?")]);
    expect(s.exchanges[0].question).toBe("What do you see in this upper part, there?");
    expect(s.awaiting_question_exchange_id).toBeNull();
    expect(s.unlinked_agent_questions).toEqual([]);
  });

  it("rejects an unknown event_id with an error result and creates no exchange", () => {
    const s = run([event(evt1), event(evt2), ask("evt-009")]);
    expect(s.exchanges).toEqual([]);
    expect(s.active_exchange_id).toBeNull();
    expect(s.last_tool_result).toBe("error unknown event_id evt-009, known: evt-001, evt-002");
    expect(s.timing.filter(m => m.mark === "question_tool_called")).toEqual([]);
  });

  it("reports invalid params without changing the active exchange", () => {
    const before = run([event(evt1), ask("evt-001")]);
    const s = reduceSession(before, { type: "question_begun", params: { event_id: "evt-001", kind: "why" }, ...t() });
    expect(s.exchanges).toHaveLength(1);
    expect(s.active_exchange_id).toBe("ex-001");
    expect(s.last_tool_result).toMatch(/^error .*kind/);
  });

  it('accepts event_id "none" as a question not about an event', () => {
    const s = run([ask(null, "gap", "Anything we haven't covered?")]);
    expect(s.exchanges[0]).toMatchObject({ event_id: null, kind: "gap", source: "live", record_state: "on_record" });
  });

  it("copies record_state from the linked event", () => {
    const s = run([event(evt5), ask("evt-005")]);
    expect(s.exchanges[0].record_state).toBe("off_record");
  });
});

describe("answer attachment", () => {
  it("attaches every final user line verbatim to the active exchange", () => {
    const s = run([event(evt1), ask("evt-001"), agent("What is this?"), user("That's the joint, "), user("usually.")]);
    const ex = s.exchanges[0];
    expect(ex.answer_lines.map(l => l.text)).toEqual(["That's the joint,", "usually."].map(x => x.trim()));
    expect(ex.answer_started_at_utc).toBe(ex.answer_lines[0].at_utc);
    expect(ex.answer_ended_at_utc).toBe(ex.answer_lines[1].at_utc);
    expect(ex.answer_lines[1].transcript_line_id).toBe(s.transcript[s.transcript.length - 1].line_id);
  });

  it("keeps qualifiers and wording exactly (only outer whitespace trimmed)", () => {
    const s = run([event(evt1), ask("evt-001"), agent("Q?"), user("  Only if it's   wet, usually. ")]);
    expect(s.exchanges[0].answer_lines[0].text).toBe("Only if it's   wet, usually.");
  });

  it("a new event during an answer does NOT re-link the active exchange", () => {
    const s = run([
      event(evt1),
      ask("evt-001"),
      agent("What do you recognize here?"),
      user("So this region is"),
      event(evt2),
      user("what I'd check first."),
    ]);
    expect(s.exchanges).toHaveLength(1);
    expect(s.exchanges[0].event_id).toBe("evt-001");
    expect(s.active_exchange_id).toBe("ex-001");
    expect(s.exchanges[0].answer_lines.map(l => l.text)).toEqual(["So this region is", "what I'd check first."]);
    expect(s.events.map(e => e.event_id)).toEqual(["evt-001", "evt-002"]);
  });

  it("switches attachment only at the next begin_question", () => {
    const s = run([
      event(evt1),
      ask("evt-001"),
      agent("Q1?"),
      user("A1"),
      event(evt2),
      ask("evt-002"),
      agent("Q2?"),
      user("A2"),
    ]);
    expect(s.exchanges.map(x => [x.exchange_id, x.event_id, x.answer_lines.map(l => l.text)])).toEqual([
      ["ex-001", "evt-001", ["A1"]],
      ["ex-002", "evt-002", ["A2"]],
    ]);
  });

  it("keeps user lines before any question in the preamble", () => {
    const s = run([user("Okay, let me start with the overview."), event(evt1), user("This one.")]);
    expect(s.preamble.map(l => l.text)).toEqual(["Okay, let me start with the overview.", "This one."]);
    expect(s.exchanges).toEqual([]);
  });

  it("tags transcript entries with the exchange active at the time", () => {
    const s = run([user("Intro."), event(evt1), ask("evt-001"), agent("Q?"), user("A.")]);
    expect(s.transcript.map(e => [e.role, e.exchange_id])).toEqual([
      ["user", null],
      ["agent", "ex-001"],
      ["user", "ex-001"],
    ]);
  });
});

describe("unlinked agent questions", () => {
  it("flags agent speech ending in a question without a preceding begin_question", () => {
    const s = run([event(evt1), agent("Interesting. What makes you look there?")]);
    expect(s.unlinked_agent_questions).toEqual([
      { line_id: s.transcript[0].line_id, text: "Interesting. What makes you look there?", at_utc: s.transcript[0].at_utc },
    ]);
    expect(s.exchanges).toEqual([]);
  });

  it("flags a second question in the same exchange (only one line fills the question)", () => {
    const s = run([event(evt1), ask("evt-001"), agent("What is this?"), user("A dip."), agent("And why here?")]);
    expect(s.exchanges[0].question).toBe("What is this?");
    expect(s.unlinked_agent_questions.map(q => q.text)).toEqual(["And why here?"]);
  });

  it("does not flag statements", () => {
    const s = run([agent("Hello! Point at anything and talk me through it.")]);
    expect(s.unlinked_agent_questions).toEqual([]);
  });

  it("leaves the first exchange's question empty when two declarations arrive back to back", () => {
    const s = run([event(evt1), event(evt2), ask("evt-001"), ask("evt-002"), agent("What about the lower one?")]);
    expect(s.exchanges.map(x => x.question)).toEqual(["", "What about the lower one?"]);
    expect(s.active_exchange_id).toBe("ex-002");
  });
});

describe("events", () => {
  it("stores an event once, but logs every arrival", () => {
    const s = run([event(evt1), event(evt1)]);
    expect(s.events).toHaveLength(1);
    expect(s.timing.filter(m => m.mark === "event_received")).toHaveLength(2);
  });
});

describe("timing marks", () => {
  it("records the full golden-path sequence with wall-clock and perf times", () => {
    const s = run([
      event(evt1),
      ask("evt-001"),
      { type: "agent_speaking_changed", speaking: true, ...t() },
      agent("Q?"),
      { type: "agent_speaking_changed", speaking: false, ...t() },
      user("A1"),
      user("A2"),
      { type: "session_ended", ...t() },
    ]);
    expect(s.timing.map(m => [m.mark, m.event_id, m.exchange_id])).toEqual([
      ["event_received", "evt-001", null],
      ["topic_queued", "evt-001", null],
      ["question_tool_called", "evt-001", "ex-001"],
      ["agent_speech_started", "evt-001", "ex-001"],
      ["answer_started", "evt-001", "ex-001"],
      ["answer_ended", "evt-001", "ex-001"],
    ]);
    const ended = s.timing[5];
    expect(ended.at_utc).toBe(s.exchanges[0].answer_ended_at_utc);
    expect(ended.at_perf_ms).toBeGreaterThan(s.timing[4].at_perf_ms);
    for (const m of s.timing) expect(m.session_id).toBe(SID);
  });

  it("closes the previous answer when the next question begins", () => {
    const s = run([event(evt1), ask("evt-001"), agent("Q?"), user("A"), ask("evt-001", "reasoning")]);
    expect(s.timing.filter(m => m.mark === "answer_ended").map(m => m.exchange_id)).toEqual(["ex-001"]);
  });

  it("does not log answer_ended for an exchange without answers", () => {
    const s = run([event(evt1), ask("evt-001"), agent("Q?"), { type: "session_ended", ...t() }]);
    expect(s.timing.some(m => m.mark === "answer_ended")).toBe(false);
  });

  it("logs speech starts outside a question without an exchange link", () => {
    const s = run([{ type: "agent_speaking_changed", speaking: true, ...t() }]);
    expect(s.timing.map(m => [m.mark, m.exchange_id])).toEqual([["agent_speech_started", null]]);
  });

  it("ignores repeated speaking=true without a speaking=false in between", () => {
    const sp = (speaking: boolean): SessionAction => ({ type: "agent_speaking_changed", speaking, ...t() });
    const s = run([sp(true), sp(true), sp(false), sp(true)]);
    expect(s.timing).toHaveLength(2);
  });
});

describe("session lifecycle and snapshot", () => {
  it("ends the session and clears the active exchange", () => {
    const s = run([event(evt1), ask("evt-001"), agent("Q?"), user("A"), { type: "session_ended", ...t() }]);
    expect(s.ended_at_utc).not.toBeNull();
    expect(s.active_exchange_id).toBeNull();
  });

  it("produces a snapshot that passes validation", () => {
    const s = run([
      { type: "connected", conversation_id: "conv_123" },
      user("Intro."),
      event(evt1),
      ask("evt-001"),
      agent("Q?"),
      user("A"),
      agent("Hm, why?"),
      { type: "session_ended", ...t() },
    ]);
    const snap = toSnapshot(s);
    expect(snap.conversation_id).toBe("conv_123");
    expect(Object.keys(snap)).not.toContain("last_tool_result");
    const r = validateSessionSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("is pure: never mutates the previous state", () => {
    const before = run([event(evt1), ask("evt-001")]);
    const frozen = JSON.stringify(before);
    run([agent("Q?"), user("A"), event(evt2)], before);
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("helpers", () => {
  it("builds a sortable, path-safe session id", () => {
    expect(newSessionId(new Date("2026-10-04T01:02:03.456Z"), () => 0.5)).toMatch(/^ses-20261004-010203-[a-z0-9]{4}$/);
  });

  it("injects the live session id into a fixture but keeps it labeled as a fixture", () => {
    const e = injectFixture(fixture("evt-001-resolved.json"), SID);
    expect(e.session_id).toBe(SID);
    expect(e.source).toBe("fixture");
  });
});

// --- Sprint 2: topics -------------------------------------------------------------

const release = (topic_id: string, stale = false): SessionAction => ({ type: "topic_released", topic_id, stale, ...t() });
const marks = (s: SessionState) => s.timing.map(m => [m.mark, m.event_id] as const);

describe("topics from events", () => {
  it("queues a topic per new event with a topic_queued mark", () => {
    const s = run([event(evt1), event(evt2)]);
    expect(s.topics.map(x => [x.topic_id, x.primary_event_id, x.state])).toEqual([
      ["top-001", "evt-001", "queued"],
      ["top-002", "evt-002", "queued"],
    ]);
    expect(marks(s)).toEqual([
      ["event_received", "evt-001"],
      ["topic_queued", "evt-001"],
      ["event_received", "evt-002"],
      ["topic_queued", "evt-002"],
    ]);
  });

  it("merges a repeat gesture as an alias: stored as evidence, marked, no new topic", () => {
    const s = run([event(evt1), event(evt3)]);
    expect(s.events.map(e => e.event_id)).toEqual(["evt-001", "evt-003"]);
    expect(s.topics).toHaveLength(1);
    expect(s.topics[0].alias_event_ids).toEqual(["evt-003"]);
    expect(marks(s).slice(-1)).toEqual([["topic_queued", "evt-003"]]);
  });

  it("drops off-record events from the queue (never released) without a topic_queued mark", () => {
    const s = run([event(evt5)]);
    expect(s.topics[0].state).toBe("dropped_off_record");
    expect(s.timing.map(m => m.mark)).toEqual(["event_received"]);
  });

  it("a repeated arrival of the same event id does not create a topic twice", () => {
    expect(run([event(evt1), event(evt1)]).topics).toHaveLength(1);
  });
});

describe("release, nudge, defer", () => {
  it("releases a topic: state, text and mark", () => {
    const s = run([event(evt1), release("top-001")]);
    const topic = s.topics[0];
    expect(topic.state).toBe("released");
    expect(topic.stale_at_release).toBe(false);
    expect(topic.release_text).toMatch(/^\[POINTING_EVENT\] event_id=evt-001 /);
    expect(topic.release_text).toContain("No guardrail question yet");
    expect(marks(s).slice(-1)).toEqual([["topic_released", "evt-001"]]);
  });

  it("writes the stale wording into the release text", () => {
    const s = run([event(evt1), release("top-001", true)]);
    expect(s.topics[0].release_text).toContain("a moment ago on SYS1");
  });

  it("ignores a release of a topic that is not queued", () => {
    const before = run([event(evt5)]);
    expect(reduceSession(before, release("top-001"))).toBe(before);
  });

  it("records a nudge once", () => {
    const s = run([event(evt1), release("top-001"), { type: "topic_nudged", topic_id: "top-001", ...t() }]);
    expect(s.topics[0].nudged_at_perf_ms).not.toBeNull();
    expect(marks(s).slice(-1)).toEqual([["topic_nudged", "evt-001"]]);
  });

  it("defers topics to the debrief with a reason (kept, not dropped)", () => {
    const s = run([event(evt1), event(evt2), { type: "topics_deferred", topic_ids: ["top-002"], reason: "budget", ...t() }]);
    expect(s.topics.map(x => [x.state, x.deferred_reason])).toEqual([
      ["queued", null],
      ["deferred_to_debrief", "budget"],
    ]);
  });
});

describe("questions on topics", () => {
  it("marks the topic asked, then answered at the first answer line", () => {
    let s = run([event(evt1), release("top-001"), ask("evt-001")]);
    expect(s.topics[0].state).toBe("asked");
    expect(s.topics[0].exchange_ids).toEqual(["ex-001"]);
    expect(s.topics[0].asked_at_perf_ms).not.toBeNull();
    expect(s.exchanges[0]).toMatchObject({ topic_id: "top-001", related_event_ids: [] });
    s = run([agent("What do you recognise here?"), user("That spike.")], s);
    expect(s.topics[0].state).toBe("answered");
  });

  it("a follow-up re-opens the topic as asked", () => {
    const s = run([event(evt1), release("top-001"), ask("evt-001"), user("A spike."), ask("evt-001", "guardrail")]);
    expect(s.topics[0].state).toBe("asked");
    expect(s.topics[0].exchange_ids).toEqual(["ex-001", "ex-002"]);
  });

  it("attributes a question about an alias to the topic's primary event", () => {
    const s = run([event(evt1), event(evt3), ask("evt-003")]);
    expect(s.exchanges[0]).toMatchObject({ event_id: "evt-001", topic_id: "top-001", related_event_ids: ["evt-003"] });
    expect(s.timing.find(m => m.mark === "question_tool_called")?.event_id).toBe("evt-001");
  });

  it("ambiguous topic: rejects a non-clarifying first question with an error", () => {
    const s = run([event(evt4), ask("evt-004", "explain")]);
    expect(s.exchanges).toEqual([]);
    expect(s.last_tool_result).toBe(
      "error event evt-004 is ambiguous: your first question about it must have kind clarify_reference (which region do they mean)"
    );
    expect(s.timing.filter(m => m.mark === "question_tool_called")).toEqual([]);
  });

  it("ambiguous topic: accepts clarify_reference first, then other kinds", () => {
    const s = run([
      event(evt4),
      ask("evt-004", "clarify_reference", "Which part do you mean?"),
      user("Both channels."),
      ask("evt-004", "explain"),
    ]);
    expect(s.exchanges.map(x => x.kind)).toEqual(["clarify_reference", "explain"]);
  });

  it("produces a snapshot with topics and config that passes validation", () => {
    const s = run([event(evt1), event(evt3), release("top-001"), ask("evt-003"), agent("Q?"), user("A.")]);
    const r = validateSessionSnapshot(toSnapshot(s));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});

describe("speech and config", () => {
  it("logs expert speech start and end marks", () => {
    const s = run([
      { type: "user_speech_changed", speaking: true, ...t() },
      { type: "user_speech_changed", speaking: false, ...t() },
    ]);
    expect(s.timing.map(m => m.mark)).toEqual(["user_speech_started", "user_speech_ended"]);
  });

  it("changes the interview config (stored with the session)", () => {
    const s = run([{ type: "config_changed", config: { pause_ms: 1600 } }]);
    expect(s.interview_config.pause_ms).toBe(1600);
  });
});
