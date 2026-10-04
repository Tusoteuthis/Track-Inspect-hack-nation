import { z } from "zod";
import { makeParser } from "./parse";

export const ErrorCodeSchema = z.enum([
  "validation_failed",
  "unauthorized",
  "off_record",
  "not_found",
  "conflict_immutable",
  "asset_not_available",
  "stale_revision",
  "evaluation_required",
  "evaluation_pending",
  "evaluation_stale",
  "commit_blocked",
  "invalid_transition",
  "internal",
  // S3 (reserved by D12). canCommit codes travel in `details.policy_code` (D10).
  "no_confirmed_knowledge",
  "case_not_permitted",
]);
export type ErrorCode = z.output<typeof ErrorCodeSchema>;

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

/** HTTP status for each error code. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, ErrorStatus>> = {
  validation_failed: 400,
  unauthorized: 401,
  off_record: 403,
  not_found: 404,
  conflict_immutable: 409,
  asset_not_available: 409,
  stale_revision: 409,
  evaluation_required: 409,
  evaluation_pending: 409,
  evaluation_stale: 409,
  commit_blocked: 409,
  invalid_transition: 409,
  internal: 500,
  no_confirmed_knowledge: 409,
  case_not_permitted: 409,
};

/** `{error: {code, message, details?}}` body returned by every failing route. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.output<typeof ApiErrorBodySchema>;
export const parseApiErrorBody = makeParser(ApiErrorBodySchema);
