import { z } from "zod";
import { IdSchema, KnowledgeRefSchema, RecordStateSchema, SourceSchema, UtcSchema } from "./common";
import { RecordStateTriggerSchema, RecordingSegmentSchema } from "./expert";
import { makeParser } from "./parse";

export const SessionRoleSchema = z.enum(["expert", "newcomer"]);
export type SessionRole = z.output<typeof SessionRoleSchema>;

/**
 * Transitions: created→active→ended; created|active|paused→aborted; active⇄paused (integration, D53);
 * paused→ended. ended/aborted are terminal. Paused is not a privacy state: writes are still stored.
 */
export const SessionLifecycleSchema = z.enum(["created", "active", "paused", "ended", "aborted"]);
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
    /** S4: bumped by every deletion cascade or off-record purge; jobs started on an older one are discarded. */
    generation: z.number().int().min(0).optional(),
    /** S3, newcomer only: fixture/stub knowledge may be pinned (`?allow_fixture_knowledge=1`). */
    knowledge_fixture_allowed: z.boolean().optional(),
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

/** `POST /api/sessions` body (expert since S1, newcomer since S3). */
/** Expert: `case_id` (integration G8) names a case marked `shown_to_expert`; its trace becomes `trace_ref`. */
export const CreateExpertSessionRequestSchema = z
  .strictObject({
    role: z.literal("expert"),
    source: SourceSchema.default("live"),
    trace_ref: z.string().nullable().default(null),
    case_id: IdSchema.nullable().default(null),
  })
  .refine(r => r.case_id === null || r.trace_ref === null, {
    path: ["trace_ref"],
    message: "send case_id or trace_ref, not both (the case decides its trace)",
  });
/** Newcomer: `case_id` omitted → the server picks a case not shown to the expert. */
export const CreateNewcomerSessionRequestSchema = z.strictObject({
  role: z.literal("newcomer"),
  source: SourceSchema.default("live"),
  case_id: IdSchema.nullable().default(null),
});
export const CreateSessionRequestSchema = z.discriminatedUnion("role", [
  CreateExpertSessionRequestSchema,
  CreateNewcomerSessionRequestSchema,
]);
export type CreateSessionRequest = z.output<typeof CreateSessionRequestSchema>;
export const parseCreateSessionRequest = makeParser(CreateSessionRequestSchema);

export const LifecycleActionSchema = z.enum(["start", "pause", "resume", "end", "abort"]);
export type LifecycleAction = z.output<typeof LifecycleActionSchema>;

/** `POST /api/sessions/:sid/lifecycle` body. `rev` must be the session's current rev. */
export const LifecycleRequestSchema = z.strictObject({
  action: LifecycleActionSchema,
  rev: z.number().int().min(1),
});
export type LifecycleRequest = z.output<typeof LifecycleRequestSchema>;
export const parseLifecycleRequest = makeParser(LifecycleRequestSchema);

/**
 * `POST /api/sessions/:sid/record-state` body. S4: `since_utc` (off_record only) starts the
 * off-record segment in the past — "that last part was off the record" — and purges what was
 * stored since then. It must lie inside the current on-record segment.
 */
export const RecordStateRequestSchema = z
  // `trigger` (ws3.v1) records what caused the change on the new segment; default `console`.
  .strictObject({ state: RecordStateSchema, since_utc: UtcSchema.optional(), trigger: RecordStateTriggerSchema.optional() })
  .refine(r => r.since_utc === undefined || r.state === "off_record", { path: ["since_utc"], message: "only with state off_record" });
export type RecordStateRequest = z.output<typeof RecordStateRequestSchema>;
export const parseRecordStateRequest = makeParser(RecordStateRequestSchema);
