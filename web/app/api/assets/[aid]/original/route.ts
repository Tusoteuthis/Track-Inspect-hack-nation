import { assetFileResponse } from "@/lib/backend/assets";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ aid: string }> }): Promise<Response> {
  const { aid } = await ctx.params;
  return handleRoute({ component: "assets", op: "get_original", ids: { asset_id: aid } }, () =>
    assetFileResponse(aid, "original"),
  );
}
