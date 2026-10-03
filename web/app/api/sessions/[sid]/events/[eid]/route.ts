import { getEvent, putEvent } from "@/lib/backend/events";
import { handleRoute, readJsonBody } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string; eid: string }> };

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { sid, eid } = await ctx.params;
  return handleRoute({ component: "events", op: "put", ids: { session_id: sid, event_id: eid } }, async () => {
    const { status, ack } = await putEvent(sid, eid, await readJsonBody(request));
    return Response.json(ack, { status });
  });
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid, eid } = await ctx.params;
  return handleRoute({ component: "events", op: "get", ids: { session_id: sid, event_id: eid } }, async () =>
    Response.json(await getEvent(sid, eid)),
  );
}
