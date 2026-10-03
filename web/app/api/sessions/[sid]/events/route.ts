import { listEvents } from "@/lib/backend/events";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "events", op: "list", ids: { session_id: sid } }, async () =>
    Response.json(await listEvents(sid)),
  );
}
