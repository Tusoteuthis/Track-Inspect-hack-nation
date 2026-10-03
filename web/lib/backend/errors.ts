// Temporary local copy: Lane B's web/lib/contracts/errors.ts becomes the single source after merge (T051).
export type ErrorCode =
  | "validation_failed"
  | "unauthorized"
  | "off_record"
  | "not_found"
  | "conflict_immutable"
  | "asset_not_available"
  | "stale_revision"
  | "evaluation_required"
  | "evaluation_pending"
  | "evaluation_stale"
  | "commit_blocked"
  | "invalid_transition"
  | "internal";

export const ERROR_STATUS: Record<ErrorCode, number> = {
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
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const error: { code: ErrorCode; message: string; details?: Record<string, unknown> } = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) error.details = err.details;
    return Response.json({ error }, { status: err.status });
  }
  // Unknown errors may carry paths or content; never echo their message.
  return Response.json(
    { error: { code: "internal", message: "Internal server error." } },
    { status: ERROR_STATUS.internal },
  );
}
