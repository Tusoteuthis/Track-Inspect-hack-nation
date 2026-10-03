import { getExchange, putExchange } from "@/lib/backend/exchanges";
import { handleRoute, readJsonBody } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string; xid: string }> };

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { sid, xid } = await ctx.params;
  return handleRoute({ component: "exchanges", op: "put", ids: { session_id: sid, exchange_id: xid } }, async () => {
    const { status, exchange } = await putExchange(sid, xid, await readJsonBody(request));
    return Response.json(exchange, { status });
  });
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid, xid } = await ctx.params;
  return handleRoute({ component: "exchanges", op: "get", ids: { session_id: sid, exchange_id: xid } }, async () =>
    Response.json(await getExchange(sid, xid)),
  );
}
