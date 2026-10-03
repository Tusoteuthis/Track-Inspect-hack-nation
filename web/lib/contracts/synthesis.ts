import { z } from "zod";
import { IdSchema, KnowledgeRefSchema, NonEmptyString, ProducedBySchema, SourceSchema, UtcSchema } from "./common";
import { ExpertConfirmationSchema } from "./expert";
import { ConfirmationSchema } from "./knowledge";
import { makeParser } from "./parse";

export const JobStatusSchema = z.enum(["queued", "running", "done", "failed", "discarded"]);
export type JobStatus = z.output<typeof JobStatusSchema>;

export const ModuleInfoSchema = z.object({ id: NonEmptyString, version: NonEmptyString, source: SourceSchema });
export type ModuleInfo = z.output<typeof ModuleInfoSchema>;

/**
 * What a synthesis job read when it started. The job persists only if every listed record is
 * still stored with the same rev (events are immutable, so presence is enough).
 */
export const JobInputRevsSchema = z.object({
  event_ids: z.array(IdSchema),
  /** exchange_id → rev */
  exchanges: z.record(IdSchema, z.number().int().min(1)),
  /** entry_id → current_revision_id, for every knowledge entry */
  entries: z.record(IdSchema, IdSchema),
  confirmation_ids: z.array(IdSchema),
});
export type JobInputRevs = z.output<typeof JobInputRevsSchema>;

/** `RUNTIME_DIR/jobs/<job_id>.json`. IDs, statuses and error codes only — never content. */
export const JobSchema = z.object({
  job_id: IdSchema,
  session_id: IdSchema,
  kind: z.literal("synthesis"),
  status: JobStatusSchema,
  module: ModuleInfoSchema,
  input_revs: JobInputRevsSchema.nullable(),
  revision_ids: z.array(IdSchema),
  created_at_utc: UtcSchema,
  started_at_utc: UtcSchema.nullable(),
  finished_at_utc: UtcSchema.nullable(),
  /** `code` is a WS6 reason (e.g. `module_error`, `revision_conflict`, `interrupted`). */
  error: z.object({ code: NonEmptyString, message: z.string() }).nullable(),
  /** e.g. `exchange_changed:<id>`, `event_deleted:<id>`, `entry_changed:<id>`. */
  discard_reason: z.string().nullable(),
});
export type Job = z.output<typeof JobSchema>;

/** WS5 gap, stored verbatim. `kind` is WS5's vocabulary; WS6 does not interpret it. */
export const GapSchema = z.object({
  // WS5 ids look like `gap-missing_reason-evt-002` (underscores), so not the path-safe ID rule.
  gap_id: NonEmptyString,
  kind: NonEmptyString,
  description: z.string(),
  related_event_ids: z.array(IdSchema),
  related_exchange_ids: z.array(IdSchema),
  priority: z.number().int().min(1).max(3),
});
export type Gap = z.output<typeof GapSchema>;

/** `knowledge/sessions/<sid>/gaps.json`, served by `GET /api/sessions/:sid/gaps`. */
export const GapsViewSchema = z.object({
  session_id: IdSchema,
  job_id: IdSchema.nullable(),
  produced_by: ModuleInfoSchema.nullable(),
  gaps: z.array(GapSchema),
  updated_at_utc: UtcSchema.nullable(),
});
export type GapsView = z.output<typeof GapsViewSchema>;

export const ReconfirmationFlagSchema = z.object({ entry_id: IdSchema, revision_id: IdSchema, reason: z.string() });

/**
 * `knowledge/sessions/<sid>/draft.json`, served by `GET /api/sessions/:sid/draft` (expert sessions).
 * `revision_ids` are exactly what a teach-back confirmation must name as `reviewed_revision_ids`.
 */
export const SessionDraftViewSchema = z.object({
  session_id: IdSchema,
  job_id: IdSchema.nullable(),
  produced_by: ModuleInfoSchema.nullable(),
  revision_ids: z.array(IdSchema),
  reviewed: z.array(KnowledgeRefSchema),
  teach_back: z.string().nullable(),
  flagged_for_reconfirmation: z.array(ReconfirmationFlagSchema),
  updated_at_utc: UtcSchema.nullable(),
});
export type SessionDraftView = z.output<typeof SessionDraftViewSchema>;

const IdempotencyKeySchema = z.string().regex(/^[\x21-\x7e]{1,200}$/, "must be 1–200 printable ASCII characters");

/** WS6 form of `POST /api/knowledge/confirmations`. */
export const ConfirmationRequestSchema = z.strictObject({
  reviewed_revision_ids: z.array(IdSchema).min(1),
  result: z.enum(["confirmed", "corrected", "unresolved"]),
  expert_response_exchange_id: IdSchema,
  idempotency_key: IdempotencyKeySchema,
  /** Entry IDs the expert's response is about; defaults to the entries of every reviewed revision. */
  step_ids_reviewed: z.array(IdSchema).optional(),
});
export type ConfirmationRequest = z.output<typeof ConfirmationRequestSchema>;

/** Either the WS6 form or a WS3 `ExpertConfirmation` (producer-owned `confirmation_id`). */
export const ConfirmationPostSchema = z.union([ConfirmationRequestSchema, ExpertConfirmationSchema]);
export type ConfirmationPost = z.output<typeof ConfirmationPostSchema>;

export const ConfirmationResponseSchema = z.object({ confirmations: z.array(ConfirmationSchema) });
export type ConfirmationResponse = z.output<typeof ConfirmationResponseSchema>;

export const parseJob = makeParser(JobSchema);
export const parseGap = makeParser(GapSchema);
export const parseGapsView = makeParser(GapsViewSchema);
export const parseSessionDraftView = makeParser(SessionDraftViewSchema);
export const parseConfirmationRequest = makeParser(ConfirmationRequestSchema);
export const parseConfirmationPost = makeParser(ConfirmationPostSchema);
