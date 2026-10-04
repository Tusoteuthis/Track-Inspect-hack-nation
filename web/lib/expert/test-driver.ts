// Test-only driver: feeds reducer actions with a steadily advancing clock. Not used by the app.
import { FIXTURE_EVENTS } from "./fixtures";
import { type SessionAction, type SessionState, initialSession, injectFixture, reduceSession } from "./session";

type Untimed<A> = A extends unknown ? Omit<A, "at_utc" | "perf_ms"> : never;

export function driver(session_id: string, t0 = Date.UTC(2026, 9, 4, 5)) {
  let ms = 0;
  let s: SessionState = initialSession(session_id, new Date(t0).toISOString());
  let line = 0;
  const stamp = () => {
    ms += 1000;
    return { at_utc: new Date(t0 + ms).toISOString(), perf_ms: ms };
  };
  const api = {
    get state() {
      return s;
    },
    set state(next: SessionState) {
      s = next;
    },
    /** Dispatches and returns the tool result string the LLM would see. */
    act(action: Untimed<SessionAction>): string | null {
      s = reduceSession(s, { ...action, ...stamp() } as SessionAction);
      return s.last_tool_result;
    },
    /** Dispatches with an explicit stamp (for back-dated marks). */
    reduce(action: SessionAction): SessionState {
      s = reduceSession(s, action);
      return s;
    },
    event(id: string) {
      const fixture = FIXTURE_EVENTS.find(f => f.event_id === id)!;
      api.act({ type: "event_received", event: injectFixture(fixture, session_id) });
    },
    /** begin_question, then the agent speaks the question. Returns the tool result. */
    ask(params: Record<string, unknown>, spoken = String(params.question)): string | null {
      const r = api.act({ type: "question_begun", params });
      if (r?.startsWith("ok")) api.agent(spoken);
      return r;
    },
    agent(text: string) {
      api.act({ type: "agent_final_line", line_id: `a${++line}`, text });
    },
    expert(text: string) {
      api.act({ type: "user_final_line", line_id: `u${++line}`, text });
    },
    lastExchangeId: () => s.exchanges.at(-1)!.exchange_id,
  };
  return api;
}

export const A1 = "That spike is usually from the wheel set passing a gap.";
export const A2 = "If both channels show the mango signature I stop and call the measurement team.";

/** Live Q&A on evt-001 (explain + guardrail), debrief, rev-1 citing both answers, explicit confirmation. */
export function confirmedSession(session_id: string) {
  const d = driver(session_id);
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert(A1);
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "covered", note: "spike from gap" }] } });
  d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else?" });
  d.expert(A2);
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "mango signature: call team" }] } });
  d.act({ type: "task_completed", trigger: "console" });
  d.act({
    type: "draft_proposed",
    trigger: "console",
    params: {
      steps: [
        { kind: "step", text: "Scan SYS1 for a narrow spike; it is usually the wheel set passing a gap.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] },
        { kind: "guardrail", text: "If both channels show the mango signature, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
      ],
    },
  });
  d.agent("First scan SYS1 for a narrow spike. If both channels show the mango signature, stop and call the team. Is that right?");
  d.expert("Yes, that's right.");
  d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } });
  if (d.state.phase !== "confirmed") throw new Error("script did not confirm");
  return d;
}

export const SENTINEL = "pineapple calibration";
export const STRUCK_WORD = "kumquat";

/**
 * A full fixture session meeting every challenge row: 3 live questions (1 guardrail) on events,
 * an off-record stretch with the sentinel phrase and an off-record capture event, ≥ 3 answered
 * debrief gaps, optionally a struck answer, a proposed draft and an explicit confirmation.
 */
export function fullSession(session_id: string, options: { strike?: boolean; end?: boolean } = {}) {
  const d = driver(session_id);
  d.act({ type: "connected", conversation_id: "conv_test_0001" });
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert("That spike is usually from the wheel set passing a gap.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "covered", note: "spike" }] } });
  d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else about that spike?" });
  d.expert("If both channels show it at the same moment I stop and call the measurement team.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "both channels" }] } });
  d.event("evt-002");
  d.ask({ event_id: "evt-002", kind: "explain", question: "What do you see in the region on SYS2?" });
  d.expert("That drift is the sensor warming up, I ignore it in the first ten minutes.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-003", dimensions: [{ dimension: "decision", status: "covered", note: "warm-up drift" }] } });

  d.expert(`Off the record: the ${SENTINEL} on this line was never signed off.`);
  d.act({ type: "record_state_tool", params: { state: "off_record" } });
  d.agent("Okay, off the record.");
  d.expert(`Between us, the ${SENTINEL} is a mess.`);
  d.event("evt-005");
  d.ask({ event_id: "evt-001", kind: "context", question: `What about the ${SENTINEL}?` });
  d.expert("Okay, back on the record.");
  d.act({ type: "record_state_tool", params: { state: "on_record" } });
  d.agent("Okay, back on the record.");

  d.expert("I'm done, that's the task.");
  d.act({ type: "task_completed", trigger: "agent_tool" });
  const answers = [
    "A loose cable gives a similar spike but only on one channel.",
    "The spike sits right where the sleeper passes, that's why.",
    "I would escalate if the drift lasts longer than ten minutes.",
  ];
  for (const [i, gap] of d.state.debrief_agenda.slice(0, 3).entries()) {
    d.ask({ event_id: gap.event_id ?? "none", kind: "gap", phase: "debrief", gap_id: gap.gap_id, question: `Debrief question ${i + 1}?` });
    d.expert(answers[i]);
    d.act({ type: "coverage_recorded", params: { exchange_id: d.lastExchangeId(), dimensions: [{ dimension: gap.dimension, status: "covered", note: "debrief" }] } });
  }
  if (options.strike) {
    const gap = d.state.debrief_agenda[3];
    d.ask({ event_id: gap.event_id ?? "none", kind: "gap", phase: "debrief", gap_id: gap.gap_id, question: "One more debrief question?" });
    d.expert(`The ${STRUCK_WORD} rule applies there too.`);
    d.expert("Actually, forget what I just said.");
    d.act({ type: "strike_requested", trigger: "agent_tool" });
  }
  d.act({
    type: "draft_proposed",
    trigger: "agent_tool",
    params: {
      steps: [
        { kind: "step", text: "First scan SYS1 for a narrow spike; it is usually the wheel set passing a gap.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] },
        { kind: "guardrail", text: "If both channels show it at the same moment, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
        { kind: "step", text: "On SYS2, ignore a slow drift in the first ten minutes: the sensor is warming up.", event_ids: ["evt-002"], exchange_ids: ["ex-003"] },
      ],
    },
  });
  d.agent("First scan SYS1 for a narrow spike. If both channels show it, stop and call the team. Ignore early drift on SYS2. Is that right?");
  d.expert("Yes, that's right.");
  d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } });
  if (options.end !== false) d.act({ type: "session_ended", cause: "stop" });
  return d;
}
