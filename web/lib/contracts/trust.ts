import { z } from "zod";
import { IdSchema, UtcSchema } from "./common";
import { makeParser } from "./parse";

export const TombstoneKindSchema = z.enum(["asset", "event", "exchange", "session"]);
export type TombstoneKind = z.output<typeof TombstoneKindSchema>;

/**
 * S4: what is left of a record that was dropped (arrived off the record) or deleted. Never content.
 * Dropped → a retry is answered `202 dropped_off_record`; deleted → `410 gone`.
 */
export const TombstoneSchema = z.object({
  kind: TombstoneKindSchema,
  id: IdSchema,
  session_id: IdSchema.nullable(),
  record_state: z.literal("off_record").optional(),
  dropped: z.boolean(),
  deleted_at_utc: UtcSchema,
  /** `off_record`, `deleted`, `off_record_purge` or `cascade:<kind>:<id>`. */
  reason: z.string().max(200),
});
export type Tombstone = z.output<typeof TombstoneSchema>;

/** `POST /api/knowledge/entries/:id/revoke`. Without `revision_id` the current revision is revoked. */
export const RevokeRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
  revision_id: IdSchema.optional(),
});
export type RevokeRequest = z.output<typeof RevokeRequestSchema>;

/** What a deletion, purge or revocation removed or invalidated. IDs only. */
export const CascadeSummarySchema = z.object({
  deleted: z.object({
    session_ids: z.array(IdSchema),
    asset_ids: z.array(IdSchema),
    event_ids: z.array(IdSchema),
    exchange_ids: z.array(IdSchema),
  }),
  /** Exchanges that kept their record but lost answer lines (retroactive off-record). */
  trimmed_exchange_ids: z.array(IdSchema),
  revoked_revision_ids: z.array(IdSchema),
  stale_evaluation_ids: z.array(IdSchema),
  affected_session_ids: z.array(IdSchema),
});
export type CascadeSummary = z.output<typeof CascadeSummarySchema>;

export const parseTombstone = makeParser(TombstoneSchema);
export const parseRevokeRequest = makeParser(RevokeRequestSchema);
