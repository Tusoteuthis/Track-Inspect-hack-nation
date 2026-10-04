import { getEvaluation } from "@/lib/backend/learner";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string; evaluation_id: string }> };

/** `GET` one evaluation (the tutor voice client speaks its `feedback_text`). */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid, evaluation_id } = await ctx.params;
  return handleRoute({ component: "evaluations", op: "get", ids: { session_id: sid, evaluation_id } }, async () =>
    Response.json(await getEvaluation(sid, evaluation_id)),
  );
}
