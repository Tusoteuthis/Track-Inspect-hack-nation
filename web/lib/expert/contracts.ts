// WS3 v0 data contracts. Field names are snake_case to match the partner briefs
// (WS2/WS5/WS6) and the JSON written to disk. `null` always means "unknown or not
// applicable"; values are never guessed. Human-readable summary:
// notes/ws3-sprints/docs/contracts-v0.md

export const SCHEMA_VERSION = "ws3.v0";

export type Source = "live" | "fixture";
export type RecordState = "on_record" | "off_record";
export type MappingStatus = "resolved" | "ambiguous" | "unresolved";
export type Phase = "live" | "debrief" | "teach_back";
export type ExchangeKind =
  | "explain"
  | "reasoning"
  | "distinction"
  | "context"
  | "guardrail"
  | "exception"
  | "clarify_reference"
  | "gap";
export type CoverageDimension = "decision" | "reason" | "cues" | "alternatives" | "guardrails" | "unresolved";
export type CoverageStatus = "missing" | "partial" | "covered";
export type StepKind = "step" | "decision" | "guardrail" | "exception";
export type ConfirmationStatus = "confirmed" | "corrected" | "unresolved";
export type EndReason = "completed" | "incomplete" | "aborted";
export type TimingMarkName =
  | "event_received"
  | "topic_queued"
  | "topic_released"
  | "question_tool_called"
  | "agent_speech_started"
  | "answer_started"
  | "answer_ended"
  | "user_speech_started"
  | "user_speech_ended"
  | "topic_nudged";
export type TopicState =
  | "queued"
  | "released"
  | "asked"
  | "answered"
  | "deferred_to_debrief"
  | "dropped_off_record";
export type DeferredReason = "budget" | "moved_on" | "release_timeout";

/** Normalized box in the original saved frame, origin top-left, values in [0, 1]. */
export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinate_space: "original_frame_normalized";
  frame_width_px: number;
  frame_height_px: number;
};

/** Position on the trace's horizontal axis. Only set when calibrated; never derived from session time. */
export type SignalInterval = { start: number; end: number; unit: string };

/** One pointing gesture (WS2 → WS3). */
export type PointingEvent = {
  schema_version: typeof SCHEMA_VERSION;
  session_id: string;
  event_id: string;
  source: Source;
  captured_at_utc: string;
  /** Elapsed recording time. Not signal time. */
  session_time_ms: number;
  frame_id: string;
  image_ref: string;
  highlighted_image_ref: string;
  region: Region;
  mapping_status: MappingStatus;
  trace_id: string | null;
  channel_id: string | null;
  signal_interval: SignalInterval | null;
  record_state: RecordState;
  /** Dev-UI hint only. Never sent to the agent, never an interpretation. */
  label?: string;
};

/** A verbatim expert transcript line attached to an exchange. */
export type AnswerLine = { text: string; at_utc: string; transcript_line_id: string };

/**
 * One question and the expert's verbatim answer (WS3 → WS5). `event_id` is fixed at creation.
 * A `clarify_reference` answer only identifies a region; it never counts as an interpretation.
 */
export type ExpertExchange = {
  exchange_id: string;
  session_id: string;
  /** Primary event of the topic the question is about. */
  event_id: string | null;
  topic_id: string | null;
  /** Duplicate gestures merged into the topic (evidence), excluding `event_id`. */
  related_event_ids: string[];
  phase: Phase;
  kind: ExchangeKind;
  /** The agent's spoken question, verbatim. "" until the agent's next final line arrives. */
  question: string;
  /** What the agent passed to `begin_question` before speaking. AI plan, not evidence. */
  question_planned: string | null;
  /** The expert's words, verbatim. Never edited or summarized. */
  answer_lines: AnswerLine[];
  asked_at_utc: string;
  answer_started_at_utc: string | null;
  answer_ended_at_utc: string | null;
  audio_offset_secs: number | null;
  record_state: RecordState;
  source: Source;
};

export type CoverageItem = {
  dimension: CoverageDimension;
  event_id: string | null;
  status: CoverageStatus;
  supporting_exchange_ids: string[];
  /** AI synthesis, not expert words. */
  note: string | null;
};

export type OpenQuestion = {
  open_question_id: string;
  missing_fact: string;
  why_it_matters: string;
  related_event_ids: string[];
  related_exchange_ids: string[];
  answered_by_exchange_id: string | null;
};

export type DraftStep = {
  step_id: string;
  /** AI synthesis in process terms; any quote inside must appear verbatim in a linked answer line. */
  text: string;
  kind: StepKind;
  supporting_event_ids: string[];
  supporting_exchange_ids: string[];
};

/** Immutable once created; a correction produces rev-(n+1) with parent_revision_id = rev-n. */
export type DraftRevision = {
  revision_id: string;
  session_id: string;
  created_at_utc: string;
  parent_revision_id: string | null;
  steps: DraftStep[];
  change_reason: string | null;
};

/** Explicit expert response about one exact revision. Silence never creates one. */
export type ExpertConfirmation = {
  confirmation_id: string;
  revision_id: string;
  status: ConfirmationStatus;
  step_ids_reviewed: string[];
  expert_response_exchange_id: string;
  at_utc: string;
};

export type SessionCompletion = {
  session_id: string;
  ended_at_utc: string;
  end_reason: EndReason;
  confirmed_revision_id: string | null;
  coverage: CoverageItem[];
  unresolved_open_question_ids: string[];
  excluded: { off_record_segments: number; excluded_exchange_ids: string[] };
  counts: { live_questions: number; live_guardrail_questions: number; debrief_questions: number };
};

export type TimingMark = {
  session_id: string;
  event_id: string | null;
  exchange_id: string | null;
  mark: TimingMarkName;
  at_utc: string;
  /** performance.now() in the client, for latency math independent of wall-clock jumps. */
  at_perf_ms: number;
};

export type RecordingSegment = {
  segment_id: string;
  state: RecordState;
  started_at_utc: string;
  ended_at_utc: string | null;
};

/**
 * Something the expert pointed at that the apprentice may ask about. Duplicate gestures
 * are merged as aliases; every event stays stored in `events`.
 */
export type Topic = {
  topic_id: string;
  session_id: string;
  primary_event_id: string;
  alias_event_ids: string[];
  state: TopicState;
  /** Primary mapping_status was not "resolved": the first question must be clarify_reference. */
  requires_clarification: boolean;
  record_state: RecordState;
  channel_id: string | null;
  /** Topic ready (= the topic_queued mark). */
  queued_at_utc: string;
  queued_at_perf_ms: number;
  /** Receive time of the newest primary/alias event; drives the dedup window and staleness. */
  last_event_at_perf_ms: number;
  released_at_utc: string | null;
  released_at_perf_ms: number | null;
  /** Latest begin_question on this topic (follow-ups included). */
  asked_at_perf_ms: number | null;
  stale_at_release: boolean | null;
  /** The exact contextual update sent to the agent. */
  release_text: string | null;
  nudged_at_perf_ms: number | null;
  exchange_ids: string[];
  deferred_reason: DeferredReason | null;
};

/** Tunables of the live interview, stored with each session so reports state what was used. */
export type InterviewConfig = {
  dedup_window_ms: number;
  dedup_min_iou: number;
  stale_after_ms: number;
  budget_max_questions: number;
  budget_window_ms: number;
  /** Minimum expert quiet time before a topic is released. */
  pause_ms: number;
  /** A released topic the agent does not ask about within this time goes to the debrief. */
  release_timeout_ms: number;
  /** Send one "[CONTROL]" nudge this long after a release if the agent stays silent; 0 = never. */
  nudge_after_ms: number;
  /** A speaking interval ends this long after the last speech signal. */
  speech_hold_ms: number;
  vad_threshold: number;
  mic_threshold: number;
};

/** Parameters of the `begin_question` client tool, after normalization ("none" → null). */
export type BeginQuestionParams = { event_id: string | null; kind: ExchangeKind; question: string };

/** One final transcript line, tagged with the exchange that was active when it arrived. */
export type TranscriptEntry = {
  line_id: string;
  role: "user" | "agent";
  text: string;
  at_utc: string;
  exchange_id: string | null;
};

/** Agent speech ending in "?" without a preceding `begin_question`: a prompt-tuning defect signal. */
export type UnlinkedQuestion = { line_id: string; text: string; at_utc: string };

/** Full state of one expert session; the client PUTs it whole, so saves are idempotent. */
export type SessionSnapshot = {
  schema_version: typeof SCHEMA_VERSION;
  session_id: string;
  conversation_id: string | null;
  started_at_utc: string;
  ended_at_utc: string | null;
  events: PointingEvent[];
  exchanges: ExpertExchange[];
  active_exchange_id: string | null;
  /** Exchange whose `question` still waits for the agent's next spoken line. */
  awaiting_question_exchange_id: string | null;
  /** Expert lines spoken before any question; kept, never dropped. */
  preamble: AnswerLine[];
  transcript: TranscriptEntry[];
  timing: TimingMark[];
  unlinked_agent_questions: UnlinkedQuestion[];
  topics: Topic[];
  interview_config: InterviewConfig;
};

// --- validation of external input ------------------------------------------

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const MAPPING_STATUSES: readonly MappingStatus[] = ["resolved", "ambiguous", "unresolved"];
const SOURCES: readonly Source[] = ["live", "fixture"];
const RECORD_STATES: readonly RecordState[] = ["on_record", "off_record"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isUnit = (v: unknown): v is number => isFiniteNumber(v) && v >= 0 && v <= 1;

function oneOf<T extends string>(allowed: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

function checkRegion(region: unknown, errors: string[]): void {
  if (!isRecord(region)) {
    errors.push("region must be an object");
    return;
  }
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isUnit(region[key])) errors.push(`region.${key} must be a number in [0, 1]`);
  }
  if (isUnit(region.width) && region.width === 0) errors.push("region.width must be > 0");
  if (isUnit(region.height) && region.height === 0) errors.push("region.height must be > 0");
  if (isUnit(region.x) && isUnit(region.width) && region.x + region.width > 1) {
    errors.push("region.x + region.width must be ≤ 1");
  }
  if (isUnit(region.y) && isUnit(region.height) && region.y + region.height > 1) {
    errors.push("region.y + region.height must be ≤ 1");
  }
  if (region.coordinate_space !== "original_frame_normalized") {
    errors.push('region.coordinate_space must be "original_frame_normalized"');
  }
  for (const key of ["frame_width_px", "frame_height_px"] as const) {
    const v = region[key];
    if (!(Number.isInteger(v) && (v as number) > 0)) errors.push(`region.${key} must be a positive integer`);
  }
}

function checkSignalInterval(interval: unknown, errors: string[]): void {
  if (interval === null) return;
  if (!isRecord(interval)) {
    errors.push("signal_interval must be an object or null");
    return;
  }
  if (!isFiniteNumber(interval.start) || !isFiniteNumber(interval.end)) {
    errors.push("signal_interval.start and signal_interval.end must be numbers");
  } else if (interval.start > interval.end) {
    errors.push("signal_interval.start must be ≤ signal_interval.end");
  }
  if (!isNonEmptyString(interval.unit)) errors.push("signal_interval.unit must be a non-empty string");
}

/** Validates a pointing event from WS2 or a fixture. Returns every violated rule, not just the first. */
export function validatePointingEvent(input: unknown): ValidationResult<PointingEvent> {
  if (!isRecord(input)) return { ok: false, errors: ["pointing event must be an object"] };
  const errors: string[] = [];

  if (input.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be "${SCHEMA_VERSION}"`);
  for (const key of ["session_id", "event_id", "frame_id", "image_ref", "highlighted_image_ref"] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (!oneOf(SOURCES, input.source)) errors.push(`source must be one of ${SOURCES.join(", ")}`);
  if (!isNonEmptyString(input.captured_at_utc) || Number.isNaN(Date.parse(input.captured_at_utc))) {
    errors.push("captured_at_utc must be an ISO-8601 timestamp");
  }
  if (!isFiniteNumber(input.session_time_ms) || input.session_time_ms < 0) {
    errors.push("session_time_ms must be a number ≥ 0");
  }
  checkRegion(input.region, errors);
  if (!oneOf(MAPPING_STATUSES, input.mapping_status)) {
    errors.push(`mapping_status must be one of ${MAPPING_STATUSES.join(", ")}`);
  }
  // Unknown identifiers must be null, not an empty placeholder string.
  for (const key of ["trace_id", "channel_id"] as const) {
    if (input[key] !== null && !isNonEmptyString(input[key])) errors.push(`${key} must be a non-empty string or null`);
  }
  if (!("signal_interval" in input)) errors.push("signal_interval must be present (use null when unknown)");
  else checkSignalInterval(input.signal_interval, errors);
  if (!oneOf(RECORD_STATES, input.record_state)) {
    errors.push(`record_state must be one of ${RECORD_STATES.join(", ")}`);
  }
  if (input.label !== undefined && typeof input.label !== "string") errors.push("label must be a string if present");

  return errors.length ? { ok: false, errors } : { ok: true, value: input as PointingEvent };
}

const EXCHANGE_KINDS: readonly ExchangeKind[] = [
  "explain",
  "reasoning",
  "distinction",
  "context",
  "guardrail",
  "exception",
  "clarify_reference",
  "gap",
];
const PHASES: readonly Phase[] = ["live", "debrief", "teach_back"];
const TIMING_MARKS: readonly TimingMarkName[] = [
  "event_received",
  "topic_queued",
  "topic_released",
  "question_tool_called",
  "agent_speech_started",
  "answer_started",
  "answer_ended",
  "user_speech_started",
  "user_speech_ended",
  "topic_nudged",
];
const TOPIC_STATES: readonly TopicState[] = [
  "queued",
  "released",
  "asked",
  "answered",
  "deferred_to_debrief",
  "dropped_off_record",
];
const DEFERRED_REASONS: readonly DeferredReason[] = ["budget", "moved_on", "release_timeout"];
const CONFIG_KEYS: readonly (keyof InterviewConfig)[] = [
  "dedup_window_ms",
  "dedup_min_iou",
  "stale_after_ms",
  "budget_max_questions",
  "budget_window_ms",
  "pause_ms",
  "release_timeout_ms",
  "nudge_after_ms",
  "speech_hold_ms",
  "vad_threshold",
  "mic_threshold",
];
const ROLES = ["user", "agent"] as const;

/** Value the agent passes as `event_id` when a question is not about a pointing event. */
export const NO_EVENT = "none";

const SESSION_ID = /^[a-z0-9-]{1,64}$/;

/** Session ids become directory names, so only a safe, flat alphabet is allowed. */
export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

const isTimestamp = (v: unknown): v is string => isNonEmptyString(v) && !Number.isNaN(Date.parse(v));
const isNullableString = (v: unknown): boolean => v === null || isNonEmptyString(v);
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isNonEmptyString);
const isNullableNumber = (v: unknown): boolean => v === null || isFiniteNumber(v);

/** Checks `begin_question` tool params from the LLM; does not check that the event is known. */
export function validateBeginQuestionParams(input: unknown): ValidationResult<BeginQuestionParams> {
  if (!isRecord(input)) return { ok: false, errors: ["params must be an object"] };
  const errors: string[] = [];
  const raw = input.event_id;
  const noEvent = raw === null || (typeof raw === "string" && raw.trim().toLowerCase() === NO_EVENT);
  if (!noEvent && !isNonEmptyString(raw)) errors.push(`event_id must be an event id or "${NO_EVENT}"`);
  if (!oneOf(EXCHANGE_KINDS, input.kind)) errors.push(`kind must be one of ${EXCHANGE_KINDS.join(", ")}`);
  if (!isNonEmptyString(input.question)) errors.push("question must be a non-empty string");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      event_id: noEvent ? null : (raw as string).trim(),
      kind: input.kind as ExchangeKind,
      question: (input.question as string).trim(),
    },
  };
}

function checkAnswerLine(line: unknown, path: string, errors: string[]): void {
  if (!isRecord(line)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!isNonEmptyString(line.text)) errors.push(`${path}.text must be a non-empty string`);
  if (!isTimestamp(line.at_utc)) errors.push(`${path}.at_utc must be an ISO-8601 timestamp`);
  if (!isNonEmptyString(line.transcript_line_id)) errors.push(`${path}.transcript_line_id must be a non-empty string`);
}

function checkAnswerLines(lines: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(lines)) errors.push(`${path} must be an array`);
  else lines.forEach((l, i) => checkAnswerLine(l, `${path}[${i}]`, errors));
}

/** Validates one exchange. `question` may be "" while the spoken question is still pending. */
export function validateExpertExchange(input: unknown): ValidationResult<ExpertExchange> {
  if (!isRecord(input)) return { ok: false, errors: ["exchange must be an object"] };
  const errors: string[] = [];
  for (const key of ["exchange_id", "session_id"] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (!isNullableString(input.event_id)) errors.push("event_id must be a non-empty string or null");
  if (!oneOf(PHASES, input.phase)) errors.push(`phase must be one of ${PHASES.join(", ")}`);
  if (!oneOf(EXCHANGE_KINDS, input.kind)) errors.push(`kind must be one of ${EXCHANGE_KINDS.join(", ")}`);
  if (typeof input.question !== "string") errors.push("question must be a string");
  if (!isNullableString(input.question_planned)) errors.push("question_planned must be a non-empty string or null");
  if (!isNullableString(input.topic_id)) errors.push("topic_id must be a non-empty string or null");
  if (!isStringList(input.related_event_ids)) errors.push("related_event_ids must be an array of strings");
  checkAnswerLines(input.answer_lines, "answer_lines", errors);
  if (!isTimestamp(input.asked_at_utc)) errors.push("asked_at_utc must be an ISO-8601 timestamp");
  for (const key of ["answer_started_at_utc", "answer_ended_at_utc"] as const) {
    if (input[key] !== null && !isTimestamp(input[key])) errors.push(`${key} must be an ISO-8601 timestamp or null`);
  }
  if (input.audio_offset_secs !== null && !isFiniteNumber(input.audio_offset_secs)) {
    errors.push("audio_offset_secs must be a number or null");
  }
  if (!oneOf(RECORD_STATES, input.record_state)) errors.push(`record_state must be one of ${RECORD_STATES.join(", ")}`);
  if (!oneOf(SOURCES, input.source)) errors.push(`source must be one of ${SOURCES.join(", ")}`);
  return errors.length ? { ok: false, errors } : { ok: true, value: input as ExpertExchange };
}

export function validateTimingMark(input: unknown): ValidationResult<TimingMark> {
  if (!isRecord(input)) return { ok: false, errors: ["timing mark must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(input.session_id)) errors.push("session_id must be a non-empty string");
  for (const key of ["event_id", "exchange_id"] as const) {
    if (!isNullableString(input[key])) errors.push(`${key} must be a non-empty string or null`);
  }
  if (!oneOf(TIMING_MARKS, input.mark)) errors.push(`mark must be one of ${TIMING_MARKS.join(", ")}`);
  if (!isTimestamp(input.at_utc)) errors.push("at_utc must be an ISO-8601 timestamp");
  if (!isFiniteNumber(input.at_perf_ms)) errors.push("at_perf_ms must be a number");
  return errors.length ? { ok: false, errors } : { ok: true, value: input as TimingMark };
}

export function validateTopic(input: unknown): ValidationResult<Topic> {
  if (!isRecord(input)) return { ok: false, errors: ["topic must be an object"] };
  const errors: string[] = [];
  for (const key of ["topic_id", "session_id", "primary_event_id"] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`${key} must be a non-empty string`);
  }
  for (const key of ["alias_event_ids", "exchange_ids"] as const) {
    if (!isStringList(input[key])) errors.push(`${key} must be an array of strings`);
  }
  if (!oneOf(TOPIC_STATES, input.state)) errors.push(`state must be one of ${TOPIC_STATES.join(", ")}`);
  if (typeof input.requires_clarification !== "boolean") errors.push("requires_clarification must be a boolean");
  if (!oneOf(RECORD_STATES, input.record_state)) errors.push(`record_state must be one of ${RECORD_STATES.join(", ")}`);
  if (!isNullableString(input.channel_id)) errors.push("channel_id must be a non-empty string or null");
  if (!isTimestamp(input.queued_at_utc)) errors.push("queued_at_utc must be an ISO-8601 timestamp");
  for (const key of ["queued_at_perf_ms", "last_event_at_perf_ms"] as const) {
    if (!isFiniteNumber(input[key])) errors.push(`${key} must be a number`);
  }
  if (input.released_at_utc !== null && !isTimestamp(input.released_at_utc)) {
    errors.push("released_at_utc must be an ISO-8601 timestamp or null");
  }
  for (const key of ["released_at_perf_ms", "asked_at_perf_ms", "nudged_at_perf_ms"] as const) {
    if (!isNullableNumber(input[key])) errors.push(`${key} must be a number or null`);
  }
  if (input.stale_at_release !== null && typeof input.stale_at_release !== "boolean") {
    errors.push("stale_at_release must be a boolean or null");
  }
  if (!isNullableString(input.release_text)) errors.push("release_text must be a non-empty string or null");
  if (input.deferred_reason !== null && !oneOf(DEFERRED_REASONS, input.deferred_reason)) {
    errors.push(`deferred_reason must be one of ${DEFERRED_REASONS.join(", ")} or null`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: input as Topic };
}

export function validateInterviewConfig(input: unknown): ValidationResult<InterviewConfig> {
  if (!isRecord(input)) return { ok: false, errors: ["must be an object"] };
  const errors: string[] = [];
  for (const key of CONFIG_KEYS) {
    const v = input[key];
    if (!isFiniteNumber(v) || v < 0) errors.push(`${key} must be a number ≥ 0`);
  }
  if (isFiniteNumber(input.dedup_min_iou) && input.dedup_min_iou > 1) errors.push("dedup_min_iou must be ≤ 1");
  return errors.length ? { ok: false, errors } : { ok: true, value: input as InterviewConfig };
}

function checkTranscriptEntry(entry: unknown, path: string, errors: string[]): void {
  if (!isRecord(entry)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!isNonEmptyString(entry.line_id)) errors.push(`${path}.line_id must be a non-empty string`);
  if (!oneOf(ROLES, entry.role)) errors.push(`${path}.role must be one of ${ROLES.join(", ")}`);
  if (!isNonEmptyString(entry.text)) errors.push(`${path}.text must be a non-empty string`);
  if (!isTimestamp(entry.at_utc)) errors.push(`${path}.at_utc must be an ISO-8601 timestamp`);
  if (!isNullableString(entry.exchange_id)) errors.push(`${path}.exchange_id must be a non-empty string or null`);
}

/** Prefixes each nested error with its array path and collects the valid values. */
function checkList<T>(
  list: unknown,
  path: string,
  validate: (item: unknown) => ValidationResult<T>,
  errors: string[]
): T[] {
  if (!Array.isArray(list)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const valid: T[] = [];
  list.forEach((item, i) => {
    const r = validate(item);
    if (r.ok) valid.push(r.value);
    else errors.push(...r.errors.map(e => `${path}[${i}].${e}`));
  });
  return valid;
}

/**
 * Validates a whole session before it is written to disk: every record, that all
 * records belong to this session, and that exchanges link only to known events.
 */
export function validateSessionSnapshot(input: unknown): ValidationResult<SessionSnapshot> {
  if (!isRecord(input)) return { ok: false, errors: ["snapshot must be an object"] };
  const errors: string[] = [];
  if (input.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be "${SCHEMA_VERSION}"`);
  if (!isValidSessionId(input.session_id)) errors.push("session_id must match ^[a-z0-9-]{1,64}$");
  if (!isNullableString(input.conversation_id)) errors.push("conversation_id must be a non-empty string or null");
  if (!isTimestamp(input.started_at_utc)) errors.push("started_at_utc must be an ISO-8601 timestamp");
  if (input.ended_at_utc !== null && !isTimestamp(input.ended_at_utc)) {
    errors.push("ended_at_utc must be an ISO-8601 timestamp or null");
  }

  const events = checkList(input.events, "events", validatePointingEvent, errors);
  const exchanges = checkList(input.exchanges, "exchanges", validateExpertExchange, errors);
  const timing = checkList(input.timing, "timing", validateTimingMark, errors);
  const topics = checkList(input.topics, "topics", validateTopic, errors);
  const config = validateInterviewConfig(input.interview_config);
  if (!config.ok) errors.push(...config.errors.map(e => `interview_config${e.startsWith("must") ? " " : "."}${e}`));
  checkAnswerLines(input.preamble, "preamble", errors);
  if (!Array.isArray(input.transcript)) errors.push("transcript must be an array");
  else input.transcript.forEach((t, i) => checkTranscriptEntry(t, `transcript[${i}]`, errors));
  if (!Array.isArray(input.unlinked_agent_questions)) errors.push("unlinked_agent_questions must be an array");
  else {
    input.unlinked_agent_questions.forEach((q, i) => {
      if (!isRecord(q) || !isNonEmptyString(q.line_id) || !isNonEmptyString(q.text) || !isTimestamp(q.at_utc)) {
        errors.push(`unlinked_agent_questions[${i}] must have line_id, text and at_utc`);
      }
    });
  }

  const sid = input.session_id;
  const records: [string, { session_id: string }[]][] = [
    ["events", events],
    ["exchanges", exchanges],
    ["timing", timing],
    ["topics", topics],
  ];
  for (const [path, list] of records) {
    list.forEach((r, i) => {
      if (r.session_id !== sid) errors.push(`${path}[${i}].session_id must equal the snapshot session_id`);
    });
  }

  const eventIds = new Set<string>();
  for (const e of events) {
    if (eventIds.has(e.event_id)) errors.push(`duplicate event_id ${e.event_id}`);
    eventIds.add(e.event_id);
  }
  const topicIds = new Set<string>();
  topics.forEach((t, i) => {
    if (topicIds.has(t.topic_id)) errors.push(`duplicate topic_id ${t.topic_id}`);
    topicIds.add(t.topic_id);
    if (!eventIds.has(t.primary_event_id)) {
      errors.push(`topics[${i}].primary_event_id ${t.primary_event_id} is not a known event`);
    }
    for (const a of t.alias_event_ids) {
      if (!eventIds.has(a)) errors.push(`topics[${i}].alias_event_ids ${a} is not a known event`);
    }
  });
  const exchangeIds = new Set<string>();
  exchanges.forEach((x, i) => {
    if (exchangeIds.has(x.exchange_id)) errors.push(`duplicate exchange_id ${x.exchange_id}`);
    exchangeIds.add(x.exchange_id);
    if (x.event_id !== null && !eventIds.has(x.event_id)) {
      errors.push(`exchanges[${i}].event_id ${x.event_id} is not a known event`);
    }
    for (const r of x.related_event_ids) {
      if (!eventIds.has(r)) errors.push(`exchanges[${i}].related_event_ids ${r} is not a known event`);
    }
    if (x.topic_id !== null && !topicIds.has(x.topic_id)) {
      errors.push(`exchanges[${i}].topic_id ${x.topic_id} is not a known topic`);
    }
  });
  for (const key of ["active_exchange_id", "awaiting_question_exchange_id"] as const) {
    const v = input[key];
    if (v !== null && !(typeof v === "string" && exchangeIds.has(v))) errors.push(`${key} must be a known exchange id or null`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: input as SessionSnapshot };
}
