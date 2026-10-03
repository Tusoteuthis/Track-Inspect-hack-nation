import { ApiError } from "@/lib/backend/errors";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { createSession } from "@/lib/backend/sessions";
import { parseCreateSessionRequest } from "@/lib/contracts/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/sessions` — create an expert session; same `Idempotency-Key` replays it (200). */
export async function POST(request: Request): Promise<Response> {
  // handleRoute reads `ids` after the body runs, so the new session_id lands in the diag line.
  const ids: Record<string, string> = {};
  return handleRoute({ component: "sessions", op: "create", ids }, async () => {
    const r = parseCreateSessionRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    const key = request.headers.get("Idempotency-Key") ?? undefined;
    const { status, session } = await createSession(r.value, key);
    ids.session_id = session.session_id;
    return Response.json(session, { status });
  });
}
