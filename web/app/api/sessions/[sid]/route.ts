import { handleRoute } from "@/lib/backend/route";
import { getSession } from "@/lib/backend/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/sessions/:sid` — the current session record. */
export async function GET(_request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "sessions", op: "get", ids: { session_id: sid } }, async () => {
    return Response.json(await getSession(sid));
  });
}
