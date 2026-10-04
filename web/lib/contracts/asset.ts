import { z } from "zod";
import { IdSchema, RecordStateSchema, SourceSchema, UtcSchema } from "./common";
import { makeParser } from "./parse";

/** Bare filename relative to the asset dir (e.g. "original.png"): no `/`, `\`, or `..`. */
const AssetFileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "must be a bare filename")
  .refine(s => !s.includes(".."), "must not contain ..");

export const AssetFileSchema = z.object({
  path: AssetFileNameSchema,
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width_px: z.number().int().positive(),
  height_px: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex chars"),
});
export type AssetFile = z.output<typeof AssetFileSchema>;

/** Immutable once stored, except `status` → "deleted" (S4). */
export const EvidenceAssetSchema = z.object({
  asset_id: IdSchema,
  session_id: IdSchema,
  event_id: IdSchema.nullable(),
  kind: z.enum(["frame", "case_trace"]),
  original: AssetFileSchema,
  highlighted: AssetFileSchema.nullable(),
  coordinate_space: z.literal("original_frame_normalized"),
  captured_at_utc: UtcSchema,
  record_state: RecordStateSchema,
  source: SourceSchema,
  status: z.enum(["stored", "deleted"]),
});
export type EvidenceAsset = z.output<typeof EvidenceAssetSchema>;

export const parseAssetFile = makeParser(AssetFileSchema);
export const parseEvidenceAsset = makeParser(EvidenceAssetSchema);

const DeclaredDimsSchema = z.strictObject({
  width_px: z.number().int().positive(),
  height_px: z.number().int().positive(),
});

/**
 * `meta` part of `PUT /api/sessions/:sid/assets/:aid`. The server fills `asset_id`, `session_id`,
 * file `path`/`mime`/`sha256` and `status`; declared dimensions must match the uploaded image.
 */
export const AssetUploadMetaSchema = z.strictObject({
  kind: z.enum(["frame", "case_trace"]),
  captured_at_utc: UtcSchema,
  source: SourceSchema,
  event_id: IdSchema.nullable().default(null),
  record_state: RecordStateSchema.default("on_record"),
  coordinate_space: z.literal("original_frame_normalized").default("original_frame_normalized"),
  original: DeclaredDimsSchema,
  highlighted: DeclaredDimsSchema.nullable().default(null),
});
export type AssetUploadMeta = z.output<typeof AssetUploadMetaSchema>;
export const parseAssetUploadMeta = makeParser(AssetUploadMetaSchema);
