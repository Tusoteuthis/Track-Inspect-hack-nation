import { z } from "zod";
import { IdSchema, KnowledgeRefSchema, SourceSchema, UtcSchema } from "./common";
import { makeParser } from "./parse";

/** Newcomer session assessment. `content` is reserved for WS5's richer structure. */
export const AssessmentSchema = z.object({
  session_id: IdSchema,
  initial_decision: z.string().nullable(),
  assistance: z.array(z.string()),
  final_outcome: z.string().nullable(),
  evidence_used: z.array(KnowledgeRefSchema),
  practice_next: z.array(z.string()),
  source: SourceSchema,
  created_at_utc: UtcSchema,
  content: z.record(z.string(), z.unknown()).optional(),
});
export type Assessment = z.output<typeof AssessmentSchema>;
export const parseAssessment = makeParser(AssessmentSchema);
