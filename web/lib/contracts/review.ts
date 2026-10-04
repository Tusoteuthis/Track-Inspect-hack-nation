import { z } from "zod";
import { IdSchema, UtcSchema } from "./common";
import { ConfirmationSchema } from "./knowledge";
import { makeParser } from "./parse";
import { GapSchema, ModuleInfoSchema, ReconfirmationFlagSchema } from "./synthesis";
import { WorkMapViewSchema, WorkMapViewStepSchema, type WorkMapViewStep } from "./workmap";

/**
 * Review mark (integration G10): the expert asks, from the review screen, for a step to be
 * corrected or flagged as unresolved. It is a request only. It never changes knowledge status;
 * WS3/WS5 decide what happens with it in the spoken review.
 */
export const ReviewMarkKindSchema = z.enum(["correction_requested", "flag_unresolved"]);
export type ReviewMarkKind = z.output<typeof ReviewMarkKindSchema>;

/** `POST /api/sessions/:sid/review-marks` body. Same `idempotency_key` + same body → the same mark (200). */
export const ReviewMarkRequestSchema = z.strictObject({
  entry_id: IdSchema,
  revision_id: IdSchema,
  kind: ReviewMarkKindSchema,
  idempotency_key: z.string().regex(/^[\x21-\x7e]{1,200}$/, "must be 1–200 printable ASCII characters"),
});
export type ReviewMarkRequest = z.output<typeof ReviewMarkRequestSchema>;

export const ReviewMarkSchema = z.object({
  mark_id: IdSchema,
  session_id: IdSchema,
  entry_id: IdSchema,
  revision_id: IdSchema,
  kind: ReviewMarkKindSchema,
  at_utc: UtcSchema,
});
export type ReviewMark = z.output<typeof ReviewMarkSchema>;

/**
 * `GET /api/sessions/:sid/review` (integration G9), expert sessions only: everything the debrief
 * screen needs in one response. `current` has one step per revision of the session's draft
 * (`revision_ids`, the set a teach-back confirmation names); `previous` has the stored parent of
 * each current revision that has one, so a client can show what changed. Steps are built like
 * Work Map steps with `include=draft` (revoked revisions are listed in `excluded`).
 */
export const SessionReviewViewSchema = z.object({
  session_id: IdSchema,
  job_id: IdSchema.nullable(),
  produced_by: ModuleInfoSchema.nullable(),
  updated_at_utc: UtcSchema.nullable(),
  revision_ids: z.array(IdSchema),
  current: z.array(WorkMapViewStepSchema),
  previous: z.array(WorkMapViewStepSchema),
  excluded: WorkMapViewSchema.shape.excluded,
  teach_back: z.string().nullable(),
  flagged_for_reconfirmation: z.array(ReconfirmationFlagSchema),
  gaps: z.array(GapSchema),
  confirmations: z.array(ConfirmationSchema),
  review_marks: z.array(ReviewMarkSchema),
});
export type SessionReviewView = Omit<z.output<typeof SessionReviewViewSchema>, "current" | "previous"> & {
  current: WorkMapViewStep[];
  previous: WorkMapViewStep[];
};

export const parseReviewMarkRequest = makeParser(ReviewMarkRequestSchema);
export const parseReviewMark = makeParser(ReviewMarkSchema);
export const parseSessionReviewView = makeParser(SessionReviewViewSchema);
