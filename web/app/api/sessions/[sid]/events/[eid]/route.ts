import { getEvent, putEvent } from "@/lib/backend/events";
import { deleteEvent } from "@/lib/backend/cascade";
import { handleRoute, readJsonBody } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string; eid: string }> };

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { sid, eid } = await ctx.params;
  return handleRoute({ component: "events", op: "put", ids: { session_id: sid, event_id: eid } }, async () => {
    const r = await putEvent(sid, eid, await readJsonBody(request));
    return Response.json(r.status === 202 ? r.dropped : r.ack, { status: r.status });
  });
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid, eid } = await ctx.params;
  return handleRoute({ component: "events", op: "get", ids: { session_id: sid, event_id: eid } }, async () =>
    Response.json(await getEvent(sid, eid)),
  );
}

/** `DELETE` → the event, its asset, exchanges about it, and every revision citing them (cascade summary). */
export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid, eid } = await ctx.params;
  return handleRoute({ component: "cascade", op: "delete_event", ids: { session_id: sid, event_id: eid } }, async () =>
    Response.json(await deleteEvent(sid, eid)),
  );
}
