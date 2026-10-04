import { z } from "zod";
import { IdSchema, KnowledgeRefSchema, NonEmptyString, ProducedBySchema, RegionSchema, SourceSchema, UtcSchema } from "./common";
import { makeParser } from "./parse";

/**
 * `CASES_DIR/<case_id>/case.json` (WS4, learner-visible material only). Strict: any other key —
 * in particular evaluator-only answer material — makes the case unusable rather than being ignored.
 * `trace_asset` is a file name inside the case directory.
 */
export const CaseFileSchema = z.strictObject({
  case_id: IdSchema,
  title: z.string().nullable(),
  trace_asset: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(png|jpg|jpeg)$/, "must be a png/jpg file name"),
  shown_to_expert: z.boolean(),
  source: SourceSchema,
  visible_context: z.array(z.string()).default([]),
  decision_options: z.array(NonEmptyString).nullable().default(null),
});
export type CaseFile = z.output<typeof CaseFileSchema>;

/** `GET /api/cases/:case_id` — the learner view. The trace bytes come from `trace.url`. */
export const LearnerCaseSchema = z.object({
  case_id: IdSchema,
  title: z.string().nullable(),
  shown_to_expert: z.boolean(),
  source: SourceSchema,
  visible_context: z.array(z.string()),
  decision_options: z.array(z.string()).nullable(),
  trace: z.object({
    url: z.string(),
    mime: z.enum(["image/png", "image/jpeg"]),
    width_px: z.number().int().positive(),
    height_px: z.number().int().positive(),
  }),
});
export type LearnerCase = z.output<typeof LearnerCaseSchema>;

const VisualContextSchema = z.array(z.object({ asset_id: IdSchema, region: RegionSchema.nullable() }));

/** Mutable newcomer draft; `draft_rev` is the monotonic revision. */
export const LearnerDraftSchema = z.object({
  session_id: IdSchema,
  draft_rev: z.number().int().min(1),
  decision: z.string(),
  reason: z.string(),
  visual_context: VisualContextSchema,
  updated_at_utc: UtcSchema,
  source: SourceSchema,
});
export type LearnerDraft = z.output<typeof LearnerDraftSchema>;

/** `PUT /api/sessions/:sid/draft`. `base_draft_rev` is the rev the learner edited (0 for the first). */
export const PutLearnerDraftRequestSchema = z.strictObject({
  base_draft_rev: z.number().int().min(0),
  decision: z.string().max(4000),
  reason: z.string().max(8000),
  visual_context: VisualContextSchema.default([]),
});
export type PutLearnerDraftRequest = z.output<typeof PutLearnerDraftRequestSchema>;

export const EvaluationStatusSchema = z.enum(["pending", "done", "failed", "stale"]);
export type EvaluationStatus = z.output<typeof EvaluationStatusSchema>;

export const CitationSchema = z.object({
  entry_id: IdSchema,
  revision_id: IdSchema,
  exchange_ids: z.array(IdSchema),
  quote: z.string().optional(),
});
export type Citation = z.output<typeof CitationSchema>;

/**
 * Immutable per `evaluation_id`; only `status` progresses (pending→done|failed|stale, done→stale,
 * server-written). `outcome` values (ok|intervene|uncertain) are WS5-defined and deliberately not
 * enumerated here.
 */
export const EvaluationSchema = z.object({
  evaluation_id: IdSchema,
  session_id: IdSchema,
  draft_rev: z.number().int().min(1),
  knowledge_revision_ids: z.array(IdSchema),
  status: EvaluationStatusSchema,
  outcome: z.string().nullable(),
  cited: z.array(CitationSchema),
  feedback_text: z.string().nullable(),
  guiding_question: z.string().nullable().optional(),
  escalation: KnowledgeRefSchema.nullable().optional(),
  created_at_utc: UtcSchema,
  updated_at_utc: UtcSchema,
  produced_by: ProducedBySchema,
  /** S3: when the tutor finished (`updated_at_utc` moves again when it later becomes stale). */
  completed_at_utc: UtcSchema.nullable().optional(),
  /** S3: why it became stale. */
  stale_reason: z.enum(["draft_changed", "knowledge_changed"]).nullable().optional(),
  /** S3: set when `failed` (`module_error`, `interrupted`); never module text. */
  error_code: z.string().nullable().optional(),
  /** S3 (WS5): why the knowledge does not settle the case, when outcome is uncertain. */
  uncertainty: z.string().nullable().optional(),
  /** S3 (WS5): evidence pointers per cited entry. */
  evidence: z
    .array(z.object({ entry_id: IdSchema, revision_id: IdSchema, event_id: IdSchema, image_ref: z.string(), highlighted_image_ref: z.string() }))
    .optional(),
  /** S3 (WS5): what WS5's deterministic output guards changed. */
  guard_notes: z.array(z.string()).optional(),
});
export type Evaluation = z.output<typeof EvaluationSchema>;

/** `POST /api/sessions/:sid/evaluations`. */
export const EvaluationRequestSchema = z.strictObject({ draft_rev: z.number().int().min(1) });
export type EvaluationRequest = z.output<typeof EvaluationRequestSchema>;

/** Immutable commit of one draft revision against one evaluation. */
export const CommitSchema = z.object({
  commit_id: IdSchema,
  session_id: IdSchema,
  draft_rev: z.number().int().min(1),
  evaluation_id: IdSchema,
  at_utc: UtcSchema,
  /** S3: the outcome that permitted it and whether it was saved with an escalation. */
  outcome: z.string().optional(),
  escalated: z.boolean().optional(),
  knowledge_revision_ids: z.array(IdSchema).optional(),
  /** S3: sha256 of the idempotency key (the key itself is not stored). */
  idempotency_key_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export type Commit = z.output<typeof CommitSchema>;

/** `POST /api/sessions/:sid/commit`. A missing `evaluation_id` is answered with `evaluation_required`. */
export const CommitRequestSchema = z.strictObject({
  draft_rev: z.number().int().min(1),
  evaluation_id: IdSchema.nullable().default(null),
  escalated: z.boolean().default(false),
  idempotency_key: z.string().regex(/^[\x21-\x7e]{1,200}$/, "must be 1–200 printable ASCII characters"),
});
export type CommitRequest = z.output<typeof CommitRequestSchema>;

export const parseCaseFile = makeParser(CaseFileSchema);
export const parseLearnerCase = makeParser(LearnerCaseSchema);
export const parseLearnerDraft = makeParser(LearnerDraftSchema);
export const parsePutLearnerDraftRequest = makeParser(PutLearnerDraftRequestSchema);
export const parseEvaluation = makeParser(EvaluationSchema);
export const parseEvaluationRequest = makeParser(EvaluationRequestSchema);
export const parseCommit = makeParser(CommitSchema);
export const parseCommitRequest = makeParser(CommitRequestSchema);
