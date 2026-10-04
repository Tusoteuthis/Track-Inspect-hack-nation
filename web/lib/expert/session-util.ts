// Small reducer helpers shared by session.ts (live) and debrief.ts (debrief, teach-back).

import type { ExpertExchange, TimingMark, TimingMarkName, Topic } from "./contracts";
import type { SessionState } from "./session";

export type Stamp = { at_utc: string; perf_ms: number };

/** Ends the active exchange's answer window, logging `answer_ended` at the last answer line. */
export function closeActive(state: SessionState): SessionState {
  const active = state.exchanges.find(x => x.exchange_id === state.active_exchange_id);
  const base = { ...state, active_exchange_id: null, awaiting_question_exchange_id: null, last_answer_at: null };
  if (!active || active.answer_lines.length === 0 || !state.last_answer_at) return base;
  return {
    ...base,
    timing: [...state.timing, mark(state, "answer_ended", active.event_id, active.exchange_id, state.last_answer_at)],
  };
}

export function updateTopic(topics: Topic[], id: string, update: (t: Topic) => Topic): Topic[] {
  return topics.map(t => (t.topic_id === id ? update(t) : t));
}

export function updateExchange(
  exchanges: ExpertExchange[],
  id: string,
  update: (x: ExpertExchange) => ExpertExchange
): ExpertExchange[] {
  return exchanges.map(x => (x.exchange_id === id ? update(x) : x));
}

export function mark(
  state: SessionState,
  name: TimingMarkName,
  event_id: string | null,
  exchange_id: string | null,
  at: Stamp
): TimingMark {
  return { session_id: state.session_id, event_id, exchange_id, mark: name, at_utc: at.at_utc, at_perf_ms: at.perf_ms };
}
