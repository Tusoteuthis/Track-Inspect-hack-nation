import { getJob } from "@/lib/backend/jobs";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ job_id: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { job_id } = await ctx.params;
  return handleRoute({ component: "synthesis", op: "get_job", ids: { job_id } }, async () => Response.json(await getJob(job_id)));
}
