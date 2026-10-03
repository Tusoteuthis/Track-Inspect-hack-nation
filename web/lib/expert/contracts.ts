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
  | "answer_ended";

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

/** One question and the expert's verbatim answer (WS3 → WS5). `event_id` is fixed at creation. */
export type ExpertExchange = {
  exchange_id: string;
  session_id: string;
  event_id: string | null;
  phase: Phase;
  kind: ExchangeKind;
  /** The agent's spoken question, verbatim. */
  question: string;
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
