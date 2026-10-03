import { z } from "zod";
import { IdSchema, NonEmptyString, ProducedBySchema, SourceSchema, UtcSchema, type Source } from "./common";
import type { ExpertConfirmation } from "./expert";
import { makeParser } from "./parse";
import { SCHEMA_VERSION } from "./version";

export const EntryStatusSchema = z.enum(["draft", "confirmed", "unresolved", "revoked"]);
export type EntryStatus = z.output<typeof EntryStatusSchema>;

/** `entries/<entry_id>/current.json` — mutable pointer to the latest revision. */
export const KnowledgeEntrySchema = z.object({
  entry_id: IdSchema,
  current_revision_id: IdSchema,
  current_revision_no: z.number().int().min(1),
  status: EntryStatusSchema,
  updated_at_utc: UtcSchema,
  rev: z.number().int().min(1),
});
export type KnowledgeEntry = z.output<typeof KnowledgeEntrySchema>;

/** Relative POSIX path with no leading `/`, no `\`, and no `.`/`..` segments. */
const RelativePathSchema = NonEmptyString.refine(
  p => !p.startsWith("/") && !p.includes("\\") && p.split("/").every(seg => seg !== "" && seg !== "." && seg !== ".."),
  "must be a relative path without . or .. segments",
);

/**
 * Immutable knowledge revision: the frontmatter of `entries/<entry_id>/rev-<revision_no>.md`.
 * `revision_id` is globally unique (server-generated `rev-<yyyymmddhhmmss>-<rand6>`); the Markdown
 * body is opaque WS5 content and is not validated here.
 */
export const KnowledgeRevisionSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  entry_id: IdSchema,
  revision_id: IdSchema,
  revision_no: z.number().int().min(1),
  parent_revision_id: IdSchema.nullable(),
  status: EntryStatusSchema,
  content_path: RelativePathSchema,
  evidence: z.object({
    event_ids: z.array(IdSchema),
    exchange_ids: z.array(IdSchema),
    asset_ids: z.array(IdSchema),
  }),
  produced_by: ProducedBySchema,
  created_at_utc: UtcSchema,
  /** S2: the expert session whose events/exchanges produced it (null for imported/fixture entries). */
  session_id: IdSchema.nullable().optional(),
  /** S2: sha256 (hex) of the module Markdown; used to dedupe re-runs. */
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** S2: why this revision differs from its parent, as given by the module. */
  change_reason: z.string().nullable().optional(),
});
export type KnowledgeRevision = z.output<typeof KnowledgeRevisionSchema>;

/** Immutable expert confirmation of one knowledge revision (WS6 naming; see `toConfirmation`). */
export const ConfirmationSchema = z.object({
  confirmation_id: IdSchema,
  reviewed_revision_id: IdSchema,
  result: z.enum(["confirmed", "corrected", "unresolved"]),
  expert_response_exchange_id: IdSchema,
  at_utc: UtcSchema,
  step_ids_reviewed: z.array(IdSchema).optional(),
  source: SourceSchema,
});
export type Confirmation = z.output<typeof ConfirmationSchema>;

/** Maps a WS3 `ExpertConfirmation` (revision_id/status) to the WS6 `Confirmation` (reviewed_revision_id/result). */
export function toConfirmation(c: ExpertConfirmation, source: Source): Confirmation {
  return {
    confirmation_id: c.confirmation_id,
    reviewed_revision_id: c.revision_id,
    result: c.status,
    expert_response_exchange_id: c.expert_response_exchange_id,
    at_utc: c.at_utc,
    step_ids_reviewed: [...c.step_ids_reviewed],
    source,
  };
}

/**
 * One line of `entries/<entry_id>/status.ndjson`. Revision files are immutable, so every later
 * status change is recorded here with its cause (S2: confirmations; S4: revocations).
 */
export const StatusTransitionSchema = z.object({
  entry_id: IdSchema,
  revision_id: IdSchema,
  from: EntryStatusSchema,
  to: EntryStatusSchema,
  at_utc: UtcSchema,
  confirmation_id: IdSchema.nullable(),
});
export type StatusTransition = z.output<typeof StatusTransitionSchema>;

export const parseKnowledgeEntry = makeParser(KnowledgeEntrySchema);
export const parseKnowledgeRevision = makeParser(KnowledgeRevisionSchema);
export const parseConfirmation = makeParser(ConfirmationSchema);
export const parseStatusTransition = makeParser(StatusTransitionSchema);
