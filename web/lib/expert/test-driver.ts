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
