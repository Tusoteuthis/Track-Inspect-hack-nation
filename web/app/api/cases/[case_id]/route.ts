import { getLearnerCase } from "@/lib/backend/cases";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ case_id: string }> };

/** `GET /api/cases/:case_id` — the learner view of a case (never evaluator material). */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { case_id } = await ctx.params;
  return handleRoute({ component: "cases", op: "get", ids: { case_id } }, async () => Response.json(await getLearnerCase(case_id)));
}
