// Pure state machine for one expert session: which question belongs to which
// pointing event, and which expert words answer which question. No React, no I/O;
// the hook in components/expert wraps it. Rules: data-model.md of the Sprint 1 spec.

import {
  type AnswerLine,
  type ExpertExchange,
  type PointingEvent,
  SCHEMA_VERSION,
  type SessionSnapshot,
  type TimingMark,
  type TimingMarkName,
  validateBeginQuestionParams,
} from "./contracts";

export type SessionState = SessionSnapshot & {
  /** String returned to the LLM by the last `begin_question` call. */
  last_tool_result: string | null;
  agent_speaking: boolean;
  /** Time of the active exchange's last answer line, so `answer_ended` gets its real time. */
  last_answer_at: Stamp | null;
};

type Stamp = { at_utc: string; perf_ms: number };

export type SessionAction =
  | { type: "connected"; conversation_id: string }
  | ({ type: "event_received"; event: PointingEvent } & Stamp)
  | ({ type: "question_begun"; params: unknown } & Stamp)
  | ({ type: "agent_final_line"; line_id: string; text: string } & Stamp)
  | ({ type: "user_final_line"; line_id: string; text: string } & Stamp)
  | ({ type: "agent_speaking_changed"; speaking: boolean } & Stamp)
  | ({ type: "session_ended" } & Stamp);

export function initialSession(session_id: string, started_at_utc: string): SessionState {
  return {
    schema_version: SCHEMA_VERSION,
    session_id,
    conversation_id: null,
    started_at_utc,
    ended_at_utc: null,
    events: [],
    exchanges: [],
    active_exchange_id: null,
    awaiting_question_exchange_id: null,
    preamble: [],
    transcript: [],
    timing: [],
    unlinked_agent_questions: [],
    last_tool_result: null,
    agent_speaking: false,
    last_answer_at: null,
  };
}

export function reduceSession(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "connected":
      return { ...state, conversation_id: action.conversation_id };

    case "event_received": {
      // Arrivals never touch exchanges: an answer in progress keeps its event.
      const known = state.events.some(e => e.event_id === action.event.event_id);
      return {
        ...state,
        events: known ? state.events : [...state.events, action.event],
        timing: [...state.timing, mark(state, "event_received", action.event.event_id, null, action)],
      };
    }

    case "question_begun":
      return beginQuestion(state, action);

    case "agent_final_line": {
      const text = action.text.trim();
      const awaiting = state.awaiting_question_exchange_id;
      const entry = {
        line_id: action.line_id,
        role: "agent" as const,
        text,
        at_utc: action.at_utc,
        exchange_id: awaiting ?? state.active_exchange_id,
      };
      const next = { ...state, transcript: [...state.transcript, entry] };
      if (awaiting) {
        return {
          ...next,
          awaiting_question_exchange_id: null,
          exchanges: updateExchange(state.exchanges, awaiting, x => ({ ...x, question: text })),
        };
      }
      if (!text.endsWith("?")) return next;
      return {
        ...next,
        unlinked_agent_questions: [
          ...state.unlinked_agent_questions,
          { line_id: action.line_id, text, at_utc: action.at_utc },
        ],
      };
    }

    case "user_final_line": {
      const text = action.text.trim();
      const active = state.active_exchange_id;
      const entry = { line_id: action.line_id, role: "user" as const, text, at_utc: action.at_utc, exchange_id: active };
      const line: AnswerLine = { text, at_utc: action.at_utc, transcript_line_id: action.line_id };
      const next = { ...state, transcript: [...state.transcript, entry] };
      if (!active) return { ...next, preamble: [...state.preamble, line] };

      const exchange = state.exchanges.find(x => x.exchange_id === active)!;
      const first = exchange.answer_lines.length === 0;
      return {
        ...next,
        last_answer_at: { at_utc: action.at_utc, perf_ms: action.perf_ms },
        exchanges: updateExchange(state.exchanges, active, x => ({
          ...x,
          answer_lines: [...x.answer_lines, line],
          answer_started_at_utc: x.answer_started_at_utc ?? action.at_utc,
          answer_ended_at_utc: action.at_utc,
        })),
        timing: first
          ? [...state.timing, mark(state, "answer_started", exchange.event_id, active, action)]
          : state.timing,
      };
    }

    case "agent_speaking_changed": {
      if (action.speaking === state.agent_speaking) return state;
      if (!action.speaking) return { ...state, agent_speaking: false };
      const exchangeId = state.awaiting_question_exchange_id ?? state.active_exchange_id;
      const eventId = state.exchanges.find(x => x.exchange_id === exchangeId)?.event_id ?? null;
      return {
        ...state,
        agent_speaking: true,
        timing: [...state.timing, mark(state, "agent_speech_started", eventId, exchangeId, action)],
      };
    }

    case "session_ended": {
      const closed = closeActive(state);
      return { ...closed, ended_at_utc: action.at_utc, agent_speaking: false };
    }
  }
}

function beginQuestion(state: SessionState, action: { params: unknown } & Stamp): SessionState {
  const parsed = validateBeginQuestionParams(action.params);
  if (!parsed.ok) return { ...state, last_tool_result: `error ${parsed.errors.join("; ")}` };

  const { event_id, kind, question } = parsed.value;
  const event = event_id === null ? null : state.events.find(e => e.event_id === event_id);
  if (event === undefined) {
    const known = state.events.map(e => e.event_id).join(", ") || "none";
    return { ...state, last_tool_result: `error unknown event_id ${event_id}, known: ${known}` };
  }

  const exchange_id = `ex-${String(state.exchanges.length + 1).padStart(3, "0")}`;
  const exchange: ExpertExchange = {
    exchange_id,
    session_id: state.session_id,
    event_id,
    phase: "live",
    kind,
    question: "",
    question_planned: question,
    answer_lines: [],
    asked_at_utc: action.at_utc,
    answer_started_at_utc: null,
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    record_state: event?.record_state ?? "on_record",
    source: event?.source ?? "live",
  };
  const closed = closeActive(state);
  return {
    ...closed,
    exchanges: [...closed.exchanges, exchange],
    active_exchange_id: exchange_id,
    awaiting_question_exchange_id: exchange_id,
    last_tool_result: `ok exchange_id=${exchange_id}`,
    timing: [...closed.timing, mark(state, "question_tool_called", event_id, exchange_id, action)],
  };
}

/** Ends the active exchange's answer window, logging `answer_ended` at the last answer line. */
function closeActive(state: SessionState): SessionState {
  const active = state.exchanges.find(x => x.exchange_id === state.active_exchange_id);
  const base = { ...state, active_exchange_id: null, awaiting_question_exchange_id: null, last_answer_at: null };
  if (!active || active.answer_lines.length === 0 || !state.last_answer_at) return base;
  return {
    ...base,
    timing: [...state.timing, mark(state, "answer_ended", active.event_id, active.exchange_id, state.last_answer_at)],
  };
}

function updateExchange(
  exchanges: ExpertExchange[],
  id: string,
  update: (x: ExpertExchange) => ExpertExchange
): ExpertExchange[] {
  return exchanges.map(x => (x.exchange_id === id ? update(x) : x));
}

function mark(
  state: SessionState,
  name: TimingMarkName,
  event_id: string | null,
  exchange_id: string | null,
  at: Stamp
): TimingMark {
  return { session_id: state.session_id, event_id, exchange_id, mark: name, at_utc: at.at_utc, at_perf_ms: at.perf_ms };
}

/** The persisted part of the state (drops client-only bookkeeping). */
export function toSnapshot(state: SessionState): SessionSnapshot {
  const { last_tool_result: _r, agent_speaking: _s, last_answer_at: _a, ...snapshot } = state;
  return snapshot;
}

/** `ses-<yyyymmdd>-<hhmmss>-<rand4>` in UTC: sortable and safe as a directory name. */
export function newSessionId(now: Date, random: () => number = Math.random): string {
  const iso = now.toISOString(); // 2026-10-04T01:02:03.456Z
  const date = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");
  const rand = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `ses-${date}-${time}-${rand}`;
}

/** A fixture joins the live session under its id, but stays labeled `source: "fixture"`. */
export function injectFixture(event: PointingEvent, session_id: string): PointingEvent {
  return { ...event, session_id };
}
