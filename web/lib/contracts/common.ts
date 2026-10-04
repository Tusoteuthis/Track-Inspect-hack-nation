import { z } from "zod";
import { makeParser } from "./parse";

/** Lowercase slug ID, 1–64 chars, no leading dash. Safe as a path segment (no `/`, `.`, `..`). */
export const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "must match ^[a-z0-9][a-z0-9-]{0,63}$");
export type Id = z.output<typeof IdSchema>;

/** ISO-8601 timestamp accepted by `Date.parse`. Field names keep the `_utc` suffix. */
export const UtcSchema = z.string().refine(s => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 timestamp");
export type Utc = z.output<typeof UtcSchema>;

/** A string with at least one non-whitespace character (WS3 rule for ids/refs). Output is not trimmed. */
export const NonEmptyString = z.string().refine(s => s.trim().length > 0, "must be a non-empty string");

/** WS6 records may also be produced by stubs. */
export const SourceSchema = z.enum(["live", "stub", "fixture"]);
export type Source = z.output<typeof SourceSchema>;

/** WS3 mirror records (`ws3.v0` Source). */
export const Ws3SourceSchema = z.enum(["live", "fixture"]);
export type Ws3Source = z.output<typeof Ws3SourceSchema>;

export const RecordStateSchema = z.enum(["on_record", "off_record"]);
export type RecordState = z.output<typeof RecordStateSchema>;

const unit = z.number().min(0).max(1);
const positiveInt = z.number().int().positive();

/** Normalized box in the original saved frame (WS3 rules). */
export const RegionSchema = z
  .object({
    x: unit,
    y: unit,
    width: unit.refine(v => v > 0, "must be > 0"),
    height: unit.refine(v => v > 0, "must be > 0"),
    coordinate_space: z.literal("original_frame_normalized"),
    frame_width_px: positiveInt,
    frame_height_px: positiveInt,
  })
  .superRefine((r, ctx) => {
    if (r.x + r.width > 1) ctx.addIssue({ code: "custom", path: ["width"], message: "x + width must be ≤ 1" });
    if (r.y + r.height > 1) ctx.addIssue({ code: "custom", path: ["height"], message: "y + height must be ≤ 1" });
  });
export type Region = z.output<typeof RegionSchema>;

/** Position on the trace axis (calibrated only). */
export const SignalIntervalSchema = z
  .object({ start: z.number(), end: z.number(), unit: NonEmptyString })
  .refine(s => s.start <= s.end, { path: ["end"], message: "start must be ≤ end" });
export type SignalInterval = z.output<typeof SignalIntervalSchema>;

/** Which module/version produced a derived record. */
export const ProducedBySchema = z.object({ module: NonEmptyString, version: NonEmptyString, source: SourceSchema });
export type ProducedBy = z.output<typeof ProducedBySchema>;

/** `{entry_id, revision_id}` pair used by pins, escalations and evidence lists. */
export const KnowledgeRefSchema = z.object({ entry_id: IdSchema, revision_id: IdSchema });
export type KnowledgeRef = z.output<typeof KnowledgeRefSchema>;

export const parseRegion = makeParser(RegionSchema);
export const parseSignalInterval = makeParser(SignalIntervalSchema);
