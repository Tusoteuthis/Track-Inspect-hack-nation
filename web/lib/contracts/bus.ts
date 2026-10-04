import { z } from "zod";
import { IdSchema, UtcSchema } from "./common";
import { makeParser } from "./parse";

/**
 * SSE envelope. Strict: carries IDs only, never content — unknown keys are rejected.
 * `seq` is per-session and monotonic; `type` is dotted (e.g. "event.stored").
 */
export const BusEventSchema = z.strictObject({
  seq: z.number().int().min(1),
  type: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "must be a dotted lowercase type, e.g. event.stored"),
  session_id: IdSchema,
  ids: z.record(z.string(), z.union([IdSchema, z.array(IdSchema)])),
  at_utc: UtcSchema,
});
export type BusEvent = z.output<typeof BusEventSchema>;
export const parseBusEvent = makeParser(BusEventSchema);
