import { z } from "zod";
import { IdSchema, KnowledgeRefSchema, ProducedBySchema, RegionSchema, SourceSchema, UtcSchema } from "./common";
import { makeParser } from "./parse";

/** Mutable newcomer draft; `draft_rev` is the monotonic revision. */
export const LearnerDraftSchema = z.object({
  session_id: IdSchema,
  draft_rev: z.number().int().min(1),
  decision: z.string(),
  reason: z.string(),
  visual_context: z.array(z.object({ asset_id: IdSchema, region: RegionSchema.nullable() })),
  updated_at_utc: UtcSchema,
  source: SourceSchema,
});
export type LearnerDraft = z.output<typeof LearnerDraftSchema>;

export const EvaluationStatusSchema = z.enum(["pending", "done", "failed", "stale"]);
export type EvaluationStatus = z.output<typeof EvaluationStatusSchema>;

/**
 * Immutable per `evaluation_id`; only `status` progresses (pending→done|failed, done→stale, server-written).
 * `outcome` values (ok|intervene|uncertain) are WS5-defined and deliberately not enumerated here.
 */
export const EvaluationSchema = z.object({
  evaluation_id: IdSchema,
  session_id: IdSchema,
  draft_rev: z.number().int().min(1),
  knowledge_revision_ids: z.array(IdSchema),
  status: EvaluationStatusSchema,
  outcome: z.string().nullable(),
  cited: z.array(
    z.object({
      entry_id: IdSchema,
      revision_id: IdSchema,
      exchange_ids: z.array(IdSchema),
      quote: z.string().optional(),
    }),
  ),
  feedback_text: z.string().nullable(),
  guiding_question: z.string().nullable().optional(),
  escalation: KnowledgeRefSchema.nullable().optional(),
  created_at_utc: UtcSchema,
  updated_at_utc: UtcSchema,
  produced_by: ProducedBySchema,
});
export type Evaluation = z.output<typeof EvaluationSchema>;

/** Immutable commit of one draft revision against one evaluation. */
export const CommitSchema = z.object({
  commit_id: IdSchema,
  session_id: IdSchema,
  draft_rev: z.number().int().min(1),
  evaluation_id: IdSchema,
  at_utc: UtcSchema,
});
export type Commit = z.output<typeof CommitSchema>;

export const parseLearnerDraft = makeParser(LearnerDraftSchema);
export const parseEvaluation = makeParser(EvaluationSchema);
export const parseCommit = makeParser(CommitSchema);
