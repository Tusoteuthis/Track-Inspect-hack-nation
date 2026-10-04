import { ERROR_STATUS, type ErrorCode } from "@/lib/contracts";

export { ERROR_STATUS, type ErrorCode };

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
