import { ApiError } from "@/lib/backend/errors";
import { onNewcomerEnded } from "@/lib/backend/learner";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { changeLifecycle } from "@/lib/backend/sessions";
import { parseLifecycleRequest } from "@/lib/contracts/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `POST /api/sessions/:sid/lifecycle` — `{ action, rev }` → updated session. */
export async function POST(request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "sessions", op: "lifecycle", ids: { session_id: sid } }, async () => {
    const r = parseLifecycleRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    const session = await changeLifecycle(sid, r.value);
    if (session.role === "newcomer" && session.lifecycle === "ended") await onNewcomerEnded(sid);
    return Response.json(session);
  });
}
