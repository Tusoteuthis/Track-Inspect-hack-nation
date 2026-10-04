import { getEntryView } from "@/lib/backend/knowledge";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return handleRoute({ component: "knowledge", op: "get_entry", ids: { entry_id: id } }, async () =>
    Response.json(await getEntryView(id)),
  );
}
