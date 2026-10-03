import { diag } from "./diag";
import { ApiError, toErrorResponse } from "./errors";

export type RouteMeta = { component: string; op: string; ids?: Record<string, string> };

/**
 * Wraps a route body: maps thrown errors to the WS6 error envelope and writes one diagnostics
 * line (IDs, duration, outcome, error code — never content) per request.
 */
export async function handleRoute(meta: RouteMeta, fn: () => Promise<Response>): Promise<Response> {
  const started = performance.now();
  let response: Response;
  let errorCode: ApiError["code"] | undefined;
  try {
    response = await fn();
  } catch (err) {
    errorCode = err instanceof ApiError ? err.code : "internal";
    response = toErrorResponse(err);
  }
  await diag({
    component: meta.component,
    op: meta.op,
    ids: meta.ids ?? {},
    outcome: response.status < 400 ? "ok" : "error",
    duration_ms: performance.now() - started,
    error_code: errorCode,
  });
  return response;
}

/** Reads a JSON body; malformed JSON → 400 validation_failed. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new ApiError("validation_failed", "Request body must be valid JSON.");
  }
}
