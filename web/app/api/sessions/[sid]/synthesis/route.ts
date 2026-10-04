import { handleRoute } from "@/lib/backend/route";
import { requestSynthesis } from "@/lib/backend/synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/** Starts (or returns the already running) synthesis job; the job runs in the background. */
export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "synthesis", op: "request", ids: { session_id: sid } }, async () => {
    const { job_id } = await requestSynthesis(sid);
    return Response.json({ job_id }, { status: 202 });
  });
}
