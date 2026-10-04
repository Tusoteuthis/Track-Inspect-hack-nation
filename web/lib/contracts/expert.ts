// Zod wrappers around the merged WS3 contracts (`@/lib/expert/contracts`, ws3.v0).
// The WS3 file stays the source of truth: types are re-exported from it, and the
// compile-time assertions at the bottom fail typecheck if WS3 changes a shape.
//
// Deliberate difference: ID-like fields (session_id, event_id, exchange_id, frame_id,
// step_id, revision_id, …) use `IdSchema` (^[a-z0-9][a-z0-9-]{0,63}$). WS3 only requires
// non-empty strings, so WS6 is stricter here (path-traversal safety); raised with WS3.
// Free-text refs (`image_ref`, `highlighted_image_ref`, `trace_id`, `channel_id`) stay
// non-empty strings.
import { z } from "zod";
import {
  SCHEMA_VERSION as WS3_SCHEMA_VERSION,
  type AnswerLine,
  type CoverageItem,
  type DraftRevision,
  type DraftStep,
  type ExpertConfirmation,
  type ExpertExchange,
  type OpenQuestion,
  type PointingEvent,
  type RecordingSegment,
  type Region as Ws3Region,
  type SignalInterval as Ws3SignalInterval,
  type Source as Ws3SourceType,
  type TimingMark,
} from "@/lib/expert/contracts";
import {
  IdSchema,
  NonEmptyString,
  RecordStateSchema,
  RegionSchema,
  SignalIntervalSchema,
  UtcSchema,
  Ws3SourceSchema,
} from "./common";
import { makeParser } from "./parse";

export type {
  AnswerLine,
  CoverageItem,
  DraftRevision,
  DraftStep,
  ExpertConfirmation,
  ExpertExchange,
  OpenQuestion,
  PointingEvent,
  RecordingSegment,
  TimingMark,
} from "@/lib/expert/contracts";
export { WS3_SCHEMA_VERSION };

const nullableId = IdSchema.nullable();
const ids = z.array(IdSchema);

export const PointingEventSchema = z.object({
  schema_version: z.literal(WS3_SCHEMA_VERSION),
  session_id: IdSchema,
  event_id: IdSchema,
  source: Ws3SourceSchema,
  captured_at_utc: UtcSchema,
  session_time_ms: z.number().min(0),
  frame_id: IdSchema,
  image_ref: NonEmptyString,
  highlighted_image_ref: NonEmptyString,
  region: RegionSchema,
  mapping_status: z.enum(["resolved", "ambiguous", "unresolved"]),
  /** Unknown must be `null`, never "". */
  trace_id: NonEmptyString.nullable(),
  channel_id: NonEmptyString.nullable(),
  /** Key is required; `null` when uncalibrated. */
  signal_interval: SignalIntervalSchema.nullable(),
  record_state: RecordStateSchema,
  /** Dev-UI hint only; never an interpretation. */
  label: z.string().optional(),
});

/**
 * WS6 ingestion shape for a pointing event: WS3 PointingEvent + optional `asset_id`.
 *
 * Asset mapping (enforced at ingestion in S1):
 * 1. WS2 uploads the frame as an EvidenceAsset first, then sends the event carrying `asset_id`.
 * 2. On ingestion WS6 sets `image_ref = /api/assets/<asset_id>/original` and
 *    `highlighted_image_ref = /api/assets/<asset_id>/highlighted`.
 * 3. The asset must exist with `status: "stored"`, otherwise the request fails with
 *    `409 asset_not_available`.
 */
export const PointingEventIngestSchema = PointingEventSchema.extend({ asset_id: IdSchema.optional() });
export type PointingEventIngest = z.output<typeof PointingEventIngestSchema>;

export const AnswerLineSchema = z.object({
  text: z.string(),
  at_utc: UtcSchema,
  transcript_line_id: IdSchema,
});

export const ExpertExchangeSchema = z.object({
  exchange_id: IdSchema,
  session_id: IdSchema,
  event_id: nullableId,
  phase: z.enum(["live", "debrief", "teach_back"]),
  kind: z.enum(["explain", "reasoning", "distinction", "context", "guardrail", "exception", "clarify_reference", "gap"]),
  question: z.string(),
  /** WS3 S1. Older producers omit it; it is then stored as null. */
  question_planned: z.string().nullable().default(null),
  answer_lines: z.array(AnswerLineSchema),
  asked_at_utc: UtcSchema,
  answer_started_at_utc: UtcSchema.nullable(),
  answer_ended_at_utc: UtcSchema.nullable(),
  audio_offset_secs: z.number().nullable(),
  record_state: RecordStateSchema,
  source: Ws3SourceSchema,
});

/** WS6 ingestion shape: WS3 ExpertExchange + optional `rev` (int ≥ 1) for mutable storage. */
export const ExpertExchangeIngestSchema = ExpertExchangeSchema.extend({ rev: z.number().int().min(1).optional() });
export type ExpertExchangeIngest = z.output<typeof ExpertExchangeIngestSchema>;

export const CoverageItemSchema = z.object({
  dimension: z.enum(["decision", "reason", "cues", "alternatives", "guardrails", "unresolved"]),
  event_id: nullableId,
  status: z.enum(["missing", "partial", "covered"]),
  supporting_exchange_ids: ids,
  note: z.string().nullable(),
});

export const OpenQuestionSchema = z.object({
  open_question_id: IdSchema,
  missing_fact: z.string(),
  why_it_matters: z.string(),
  related_event_ids: ids,
  related_exchange_ids: ids,
  answered_by_exchange_id: nullableId,
});

export const DraftStepSchema = z.object({
  step_id: IdSchema,
  text: z.string(),
  kind: z.enum(["step", "decision", "guardrail", "exception"]),
  supporting_event_ids: ids,
  supporting_exchange_ids: ids,
});

export const DraftRevisionSchema = z.object({
  revision_id: IdSchema,
  session_id: IdSchema,
  created_at_utc: UtcSchema,
  parent_revision_id: nullableId,
  steps: z.array(DraftStepSchema),
  change_reason: z.string().nullable(),
});

export const ExpertConfirmationSchema = z.object({
  confirmation_id: IdSchema,
  revision_id: IdSchema,
  status: z.enum(["confirmed", "corrected", "unresolved"]),
  step_ids_reviewed: ids,
  expert_response_exchange_id: IdSchema,
  at_utc: UtcSchema,
});

export const TimingMarkSchema = z.object({
  session_id: IdSchema,
  event_id: nullableId,
  exchange_id: nullableId,
  mark: z.enum([
    "event_received",
    "topic_queued",
    "topic_released",
    "question_tool_called",
    "agent_speech_started",
    "answer_started",
    "answer_ended",
  ]),
  at_utc: UtcSchema,
  at_perf_ms: z.number(),
});

export const RecordingSegmentSchema = z.object({
  segment_id: IdSchema,
  state: RecordStateSchema,
  started_at_utc: UtcSchema,
  ended_at_utc: UtcSchema.nullable(),
});

export const parsePointingEvent = makeParser(PointingEventSchema);
export const parsePointingEventIngest = makeParser(PointingEventIngestSchema);
export const parseAnswerLine = makeParser(AnswerLineSchema);
export const parseExpertExchange = makeParser(ExpertExchangeSchema);
export const parseExpertExchangeIngest = makeParser(ExpertExchangeIngestSchema);
export const parseCoverageItem = makeParser(CoverageItemSchema);
export const parseOpenQuestion = makeParser(OpenQuestionSchema);
export const parseDraftStep = makeParser(DraftStepSchema);
export const parseDraftRevision = makeParser(DraftRevisionSchema);
export const parseExpertConfirmation = makeParser(ExpertConfirmationSchema);
export const parseTimingMark = makeParser(TimingMarkSchema);
export const parseRecordingSegment = makeParser(RecordingSegmentSchema);

// --- compile-time drift checks against WS3 ----------------------------------
// Each line fails `tsc` if the zod output and the WS3 type stop being identical.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Out<S extends z.ZodType> = z.output<S>;

export type _Ws3DriftChecks = [
  Assert<Equals<Out<typeof PointingEventSchema>, PointingEvent>>,
  Assert<Equals<Out<typeof AnswerLineSchema>, AnswerLine>>,
  Assert<Equals<Out<typeof ExpertExchangeSchema>, ExpertExchange>>,
  Assert<Equals<Out<typeof CoverageItemSchema>, CoverageItem>>,
  Assert<Equals<Out<typeof OpenQuestionSchema>, OpenQuestion>>,
  Assert<Equals<Out<typeof DraftStepSchema>, DraftStep>>,
  Assert<Equals<Out<typeof DraftRevisionSchema>, DraftRevision>>,
  Assert<Equals<Out<typeof ExpertConfirmationSchema>, ExpertConfirmation>>,
  Assert<Equals<Out<typeof TimingMarkSchema>, TimingMark>>,
  Assert<Equals<Out<typeof RecordingSegmentSchema>, RecordingSegment>>,
  Assert<Equals<Out<typeof RegionSchema>, Ws3Region>>,
  Assert<Equals<Out<typeof SignalIntervalSchema>, Ws3SignalInterval>>,
  Assert<Equals<Out<typeof Ws3SourceSchema>, Ws3SourceType>>,
];

// --- WS6 S1 request/response shapes -----------------------------------------

/** Response of `PUT /api/sessions/:sid/events/:eid`; `seq` is the event's `event.stored` seq, stable on retry. */
export const EventAckSchema = z.strictObject({
  event_id: IdSchema,
  status: z.literal("stored"),
  seq: z.number().int().min(1),
});

/**
 * S4: `202` answer for a write that arrived off the record. Nothing was stored except a
 * content-free tombstone, so a retry gets the same answer.
 */
export const DroppedOffRecordSchema = z.strictObject({
  status: z.literal("dropped_off_record"),
  kind: z.enum(["asset", "event", "exchange"]),
  id: IdSchema,
});
export type DroppedOffRecord = z.output<typeof DroppedOffRecordSchema>;
export type EventAck = z.output<typeof EventAckSchema>;
export const parseEventAck = makeParser(EventAckSchema);

/** Body of `PUT /api/sessions/:sid/exchanges/:xid`: the full exchange plus a required `rev`. */
export const ExchangePutSchema = ExpertExchangeSchema.extend({ rev: z.number().int().min(1) });
export type ExchangePut = z.output<typeof ExchangePutSchema>;
export const parseExchangePut = makeParser(ExchangePutSchema);
