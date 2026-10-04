import { listExchanges } from "@/lib/backend/exchanges";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "exchanges", op: "list", ids: { session_id: sid } }, async () =>
    Response.json(await listExchanges(sid)),
  );
}
