import { handleRoute } from "@/lib/backend/route";
import { getGaps } from "@/lib/backend/synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "synthesis", op: "get_gaps", ids: { session_id: sid } }, async () =>
    Response.json(await getGaps(sid)),
  );
}
