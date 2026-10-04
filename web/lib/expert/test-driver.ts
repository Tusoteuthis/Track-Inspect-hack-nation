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
