import { getSessionReview } from "@/lib/backend/review";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/** `GET /api/sessions/:sid/review` — expert debrief view in one response (integration G9). */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "review", op: "get", ids: { session_id: sid } }, async () => Response.json(await getSessionReview(sid)));
}
