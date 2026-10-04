import { getAssessment } from "@/lib/backend/assessment";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "assessment", op: "get", ids: { session_id: sid } }, async () => Response.json(await getAssessment(sid)));
}
