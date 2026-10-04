import { ApiError } from "@/lib/backend/errors";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { setRecordState } from "@/lib/backend/cascade";
import { parseRecordStateRequest } from "@/lib/contracts/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/sessions/:sid/record-state` — `{ state, since_utc? }` → updated session (new segment on
 * change). With `since_utc`, what was stored since then is purged; the summary is in `purge`.
 */
export async function POST(request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "sessions", op: "record-state", ids: { session_id: sid } }, async () => {
    const r = parseRecordStateRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    const { session, purge } = await setRecordState(sid, r.value);
    return Response.json(purge ? { ...session, purge } : session);
  });
}
