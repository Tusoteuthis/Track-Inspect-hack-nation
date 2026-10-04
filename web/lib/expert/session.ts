// Pure state machine for one expert session: which question belongs to which
// pointing event, and which expert words answer which question. No React, no I/O;
// the hook in components/expert wraps it. Rules: data-model.md of the Sprint 1 and
// Sprint 2 specs (topics: specs/20261004-015810-ws3-sprint-2-live-interview).

import {
  type AnswerLine,
  type DeferredReason,
  type ExpertExchange,
  type InterviewConfig,
  type PhaseTrigger,
  type PointingEvent,
  SCHEMA_VERSION,
  type SessionSnapshot,
  type TimingMark,
  type TimingMarkName,
  type Topic,
  validateBeginQuestionParams,
} from "./contracts";
import { beginPhaseQuestion, confirmRevision, endPhase, proposeDraft, recordCoverage, startDebrief } from "./debrief";
import { DEFAULT_INTERVIEW_CONFIG, withConfig } from "./interview-config";
import { type Stamp, closeActive, mark, updateExchange, updateTopic } from "./session-util";
import { ingestEvent, releaseText } from "./topics";

/** Appended to every successful begin_question result (the probes' tool mock uses the same words). */
export const SAY_IT = "Now say the question out loud, word for word.";

export type SessionState = SessionSnapshot & {
  /** String returned to the LLM by the last `begin_question` call. */
  last_tool_result: string | null;
  agent_speaking: boolean;
  /** Time of the active exchange's last answer line, so `answer_ended` gets its real time. */
  last_answer_at: Stamp | null;
};


export type SessionAction =
  | { type: "connected"; conversation_id: string }
  | ({ type: "event_received"; event: PointingEvent } & Stamp)
  | ({ type: "question_begun"; params: unknown } & Stamp)
  | ({ type: "agent_final_line"; line_id: string; text: string } & Stamp)
  | ({ type: "user_final_line"; line_id: string; text: string } & Stamp)
  | ({ type: "agent_speaking_changed"; speaking: boolean } & Stamp)
  | ({ type: "user_speech_changed"; speaking: boolean } & Stamp)
  | ({ type: "topic_released"; topic_id: string; stale: boolean } & Stamp)
  | ({ type: "topic_nudged"; topic_id: string } & Stamp)
  | ({ type: "topics_deferred"; topic_ids: string[]; reason: DeferredReason } & Stamp)
  | { type: "config_changed"; config: Partial<InterviewConfig> }
  | ({ type: "task_completed"; trigger: PhaseTrigger } & Stamp)
  | ({ type: "coverage_recorded"; params: unknown } & Stamp)
  | ({ type: "draft_proposed"; params: unknown | null; trigger: PhaseTrigger } & Stamp)
  | ({ type: "revision_confirmed"; params: unknown } & Stamp)
  | ({ type: "session_ended" } & Stamp);

export function initialSession(
  session_id: string,
  started_at_utc: string,
  config: InterviewConfig = DEFAULT_INTERVIEW_CONFIG
): SessionState {
  return {
    schema_version: SCHEMA_VERSION,
    session_id,
    conversation_id: null,
    conversation_ids: [],
    started_at_utc,
    ended_at_utc: null,
    end_cause: null,
    events: [],
    exchanges: [],
    active_exchange_id: null,
    awaiting_question_exchange_id: null,
    preamble: [],
    transcript: [],
    timing: [],
    unlinked_agent_questions: [],
    topics: [],
    interview_config: { ...config },
    phase: "live",
    phase_log: [],
    coverage: [],
    open_questions: [],
    debrief_agenda: [],
    revisions: [],
    confirmations: [],
    recording_segments: [{ segment_id: "seg-001", state: "on_record", started_at_utc, ended_at_utc: null, trigger: "session_start" }],
    off_record_excluded: { transcript_lines: 0, events: 0, timing_marks: 0, refused_tool_calls: 0 },
    strikes: [],
    elevenlabs_deletions: [],
    last_tool_result: null,
    agent_speaking: false,
    last_answer_at: null,
  };
}

export function reduceSession(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "connected":
      return {
        ...state,
        conversation_id: action.conversation_id,
        conversation_ids: state.conversation_ids.includes(action.conversation_id)
          ? state.conversation_ids
          : [...state.conversation_ids, action.conversation_id],
      };

    case "event_received": {
      // Arrivals never touch exchanges: an answer in progress keeps its event.
      const id = action.event.event_id;
      const received = [...state.timing, mark(state, "event_received", id, null, action)];
      if (state.events.some(e => e.event_id === id)) return { ...state, timing: received };
      const events = [...state.events, action.event];
      const { topics, topic } = ingestEvent(state.topics, events, action.event, action, state.interview_config, state.session_id);
      // Off-record gestures never become askable topics, so they get no "topic ready" mark.
      const ready = topic.state === "dropped_off_record" ? [] : [mark(state, "topic_queued", id, null, action)];
      return { ...state, events, topics, timing: [...received, ...ready] };
    }

    case "topic_released": {
      const topic = state.topics.find(t => t.topic_id === action.topic_id);
      if (!topic || topic.state !== "queued") return state;
      const text = releaseText(topic, state.events, state.exchanges, action.stale);
      return {
        ...state,
        topics: updateTopic(state.topics, topic.topic_id, t => ({
          ...t,
          state: "released",
          released_at_utc: action.at_utc,
          released_at_perf_ms: action.perf_ms,
          stale_at_release: action.stale,
          release_text: text,
        })),
        timing: [...state.timing, mark(state, "topic_released", topic.primary_event_id, null, action)],
      };
    }

    case "topic_nudged": {
      const topic = state.topics.find(t => t.topic_id === action.topic_id);
      if (!topic || topic.nudged_at_perf_ms !== null) return state;
      return {
        ...state,
        topics: updateTopic(state.topics, topic.topic_id, t => ({ ...t, nudged_at_perf_ms: action.perf_ms })),
        timing: [...state.timing, mark(state, "topic_nudged", topic.primary_event_id, null, action)],
      };
    }

    case "topics_deferred": {
      const ids = new Set(action.topic_ids);
      const deferrable = (t: Topic) => ids.has(t.topic_id) && (t.state === "queued" || t.state === "released");
      if (!state.topics.some(deferrable)) return state;
      return {
        ...state,
        topics: state.topics.map(t =>
          deferrable(t) ? { ...t, state: "deferred_to_debrief", deferred_reason: action.reason } : t
        ),
      };
    }

    case "user_speech_changed": {
      const name = action.speaking ? "user_speech_started" : "user_speech_ended";
      return { ...state, timing: [...state.timing, mark(state, name, null, null, action)] };
    }

    case "config_changed":
      return { ...state, interview_config: withConfig(action.config, state.interview_config) };

    case "question_begun":
      return beginQuestion(state, action);

    case "task_completed":
      return startDebrief(state, action.trigger, action);

    case "coverage_recorded":
      return recordCoverage(state, action.params);

    case "draft_proposed":
      return proposeDraft(state, action.params, action.trigger, action);

    case "revision_confirmed":
      return confirmRevision(state, action.params, action);

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
        topics:
          first && exchange.topic_id
            ? updateTopic(state.topics, exchange.topic_id, t => (t.state === "asked" ? { ...t, state: "answered" } : t))
            : state.topics,
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
      const closed = endPhase(closeActive(state), action);
      return { ...closed, ended_at_utc: action.at_utc, agent_speaking: false };
    }
  }
}

function beginQuestion(state: SessionState, action: { params: unknown } & Stamp): SessionState {
  const parsed = validateBeginQuestionParams(action.params);
  if (!parsed.ok) return { ...state, last_tool_result: `error ${parsed.errors.join("; ")}` };

  const phased = beginPhaseQuestion(state, parsed.value, action);
  if (phased) return phased;

  const { kind, question } = parsed.value;
  const asked = parsed.value.event_id;
  if (asked !== null && !state.events.some(e => e.event_id === asked)) {
    const known = state.events.map(e => e.event_id).join(", ") || "none";
    return { ...state, last_tool_result: `error unknown event_id ${asked}, known: ${known}` };
  }
  // A question about a repeat gesture belongs to the topic's primary event.
  const topic =
    asked === null
      ? undefined
      : state.topics.find(t => t.primary_event_id === asked || t.alias_event_ids.includes(asked));
  const event_id = topic?.primary_event_id ?? asked;
  const event = event_id === null ? null : state.events.find(e => e.event_id === event_id)!;

  if (topic?.requires_clarification && kind !== "clarify_reference") {
    const clarified = state.exchanges.some(x => x.topic_id === topic.topic_id && x.kind === "clarify_reference");
    if (!clarified) {
      return {
        ...state,
        last_tool_result: `error event ${event_id} is ambiguous: your first question about it must have kind clarify_reference (which region do they mean)`,
      };
    }
  }

  const exchange_id = `ex-${String(state.exchanges.length + 1).padStart(3, "0")}`;
  const exchange: ExpertExchange = {
    exchange_id,
    session_id: state.session_id,
    event_id,
    topic_id: topic?.topic_id ?? null,
    related_event_ids: topic ? [...topic.alias_event_ids] : [],
    phase: "live",
    kind,
    question: "",
    question_planned: question,
    answer_lines: [],
    gap_id: null,
    revision_id: null,
    asked_at_utc: action.at_utc,
    answer_started_at_utc: null,
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    record_state: event?.record_state ?? "on_record",
    source: event?.source ?? "live",
  };
  const closed = closeActive(state);
  const topics = topic
    ? updateTopic(closed.topics, topic.topic_id, t => ({
        ...t,
        // off-record topics stay dropped; Sprint 4 handles exclusion
        state: t.state === "dropped_off_record" ? t.state : "asked",
        asked_at_perf_ms: action.perf_ms,
        exchange_ids: [...t.exchange_ids, exchange_id],
      }))
    : closed.topics;
  return {
    ...closed,
    topics,
    exchanges: [...closed.exchanges, exchange],
    active_exchange_id: exchange_id,
    awaiting_question_exchange_id: exchange_id,
    last_tool_result: `ok exchange_id=${exchange_id}. ${SAY_IT}`,
    timing: [...closed.timing, mark(state, "question_tool_called", event_id, exchange_id, action)],
  };
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
