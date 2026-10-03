import { handleRoute } from "@/lib/backend/route";
import { getSession } from "@/lib/backend/sessions";
import { parseAfter, sessionStream } from "@/lib/backend/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/sessions/:sid/stream` — live BusEvents; `Last-Event-ID` / `?after=` replays missed ones. */
export async function GET(request: Request, ctx: { params: Promise<{ sid: string }> }): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "stream", op: "open", ids: { session_id: sid } }, async () => {
    await getSession(sid);
    return new Response(sessionStream(sid, { after: parseAfter(request), signal: request.signal }), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
