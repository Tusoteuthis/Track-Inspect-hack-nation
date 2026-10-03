import { ApiError } from "@/lib/backend/errors";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { changeRecordState } from "@/lib/backend/sessions";
import { parseRecordStateRequest } from "@/lib/contracts/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/sessions/:sid/record-state` — `{ state }` → updated session (new segment on change). */
export async function POST(request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "sessions", op: "record-state", ids: { session_id: sid } }, async () => {
    const r = parseRecordStateRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    return Response.json(await changeRecordState(sid, r.value));
  });
}
