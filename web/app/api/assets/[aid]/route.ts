import { getAsset } from "@/lib/backend/assets";
import { deleteAsset } from "@/lib/backend/cascade";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ aid: string }> }): Promise<Response> {
  const { aid } = await ctx.params;
  return handleRoute({ component: "assets", op: "get", ids: { asset_id: aid } }, async () =>
    Response.json(await getAsset(aid), { headers: { "Cache-Control": "private, no-cache" } }),
  );
}

/** `DELETE /api/assets/:aid` → cascade summary; again → `200` (nothing left); a later PUT of the ID → `410`. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ aid: string }> }): Promise<Response> {
  const { aid } = await ctx.params;
  return handleRoute({ component: "cascade", op: "delete_asset", ids: { asset_id: aid } }, async () => Response.json(await deleteAsset(aid)));
}
