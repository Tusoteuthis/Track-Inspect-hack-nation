import { getAsset } from "@/lib/backend/assets";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ aid: string }> }): Promise<Response> {
  const { aid } = await ctx.params;
  return handleRoute({ component: "assets", op: "get", ids: { asset_id: aid } }, async () =>
    Response.json(await getAsset(aid), { headers: { "Cache-Control": "private, no-cache" } }),
  );
}
