import { z } from "zod";
import type { WorkMapStep as Ws5WorkMapStep } from "@/lib/knowledge/synthesis-types";
import { IdSchema, RegionSchema, SourceSchema, UtcSchema } from "./common";
import { AnswerLineSchema } from "./expert";
import { EntryStatusSchema } from "./knowledge";
import { makeParser } from "./parse";
import { ModuleInfoSchema } from "./synthesis";

/** One screen moment of a step, resolved server-side to fetchable image URLs. */
export const WorkMapEvidenceSchema = z.object({
  event_id: IdSchema,
  asset_id: IdSchema,
  original_url: z.string(),
  highlighted_url: z.string().nullable(),
  region: RegionSchema,
});

/** One supporting exchange: the agent's question and the expert's verbatim answer lines. */
export const WorkMapExchangeSchema = z.object({
  exchange_id: IdSchema,
  question: z.string(),
  answer_lines: z.array(AnswerLineSchema),
});

export const WorkMapViewStepSchema = z.object({
  position: z.number().int().min(1),
  entry_id: IdSchema,
  /** null when the workflow links a revision that is not stored (reported in broken_links). */
  revision_id: IdSchema.nullable(),
  revision_no: z.number().int().min(1),
  status: EntryStatusSchema.nullable(),
  /** False when the entry has moved on to a newer revision since the workflow was generated. */
  is_current: z.boolean(),
  source: SourceSchema.nullable(),
  /** AI-written label from the module, not expert words. */
  title: z.string().nullable(),
  evidence: z.array(WorkMapEvidenceSchema),
  exchanges: z.array(WorkMapExchangeSchema),
  /** WS5 Work Map content (verbatim quotes, tagged AI synthesis, guardrails) for WS5-format revisions. */
  content: z.unknown().nullable(),
  /** Every link that did not resolve. Never silently dropped. */
  broken_links: z.array(z.string()),
});

export const WorkMapViewSchema = z.object({
  include: z.enum(["confirmed", "draft"]),
  produced_by: ModuleInfoSchema.nullable(),
  session_id: IdSchema.nullable(),
  job_id: IdSchema.nullable(),
  generated_at_utc: UtcSchema.nullable(),
  steps: z.array(WorkMapViewStepSchema),
  /** Linked steps not shown, with WS5's reason (not confirmed, superseded, revoked, not teachable…). */
  excluded: z.array(z.object({ entry_id: IdSchema, revision_id: IdSchema.nullable(), reason: z.string() })),
});

export type WorkMapEvidence = z.output<typeof WorkMapEvidenceSchema>;
export type WorkMapExchange = z.output<typeof WorkMapExchangeSchema>;
export type WorkMapViewStep = Omit<z.output<typeof WorkMapViewStepSchema>, "content"> & { content: Ws5WorkMapStep | null };
export type WorkMapView = Omit<z.output<typeof WorkMapViewSchema>, "steps"> & { steps: WorkMapViewStep[] };

export const parseWorkMapView = makeParser(WorkMapViewSchema);
