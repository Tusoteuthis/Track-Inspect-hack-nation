import { z } from "zod";
import { IdSchema, KnowledgeRefSchema, RecordStateSchema, SourceSchema, UtcSchema } from "./common";
import { RecordingSegmentSchema } from "./expert";
import { makeParser } from "./parse";

export const SessionRoleSchema = z.enum(["expert", "newcomer"]);
export type SessionRole = z.output<typeof SessionRoleSchema>;

/** Transitions (enforced in S1): created→active→ended; created|active→aborted. ended/aborted are terminal. */
export const SessionLifecycleSchema = z.enum(["created", "active", "ended", "aborted"]);
export type SessionLifecycle = z.output<typeof SessionLifecycleSchema>;

/** Mutable session record (`rev`). `pinned_knowledge` is newcomer-only and must be `null` for expert sessions. */
export const SessionSchema = z
  .object({
    session_id: IdSchema,
    role: SessionRoleSchema,
    lifecycle: SessionLifecycleSchema,
    record_state: RecordStateSchema,
    recording_segments: z.array(RecordingSegmentSchema),
    case_id: IdSchema.nullable(),
    trace_ref: z.string().nullable(),
    pinned_knowledge: z.array(KnowledgeRefSchema).nullable(),
    source: SourceSchema,
    created_at_utc: UtcSchema,
    rev: z.number().int().min(1),
  })
  .refine(s => s.role === "newcomer" || s.pinned_knowledge === null, {
    path: ["pinned_knowledge"],
    message: "pinned_knowledge must be null for expert sessions",
  });
export type Session = z.output<typeof SessionSchema>;
export const parseSession = makeParser(SessionSchema);
