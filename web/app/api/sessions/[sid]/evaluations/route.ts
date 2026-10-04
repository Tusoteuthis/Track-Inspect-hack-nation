import { ApiError } from "@/lib/backend/errors";
import { getEvaluations, requestEvaluation } from "@/lib/backend/learner";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { parseEvaluationRequest } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/**
 * `POST` `{ draft_rev }` → `202` pending `Evaluation` (the tutor runs in-process; watch SSE
 * `evaluation.done|stale|failed`). An existing pending/done evaluation of that draft → `200`.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  const ids: Record<string, string> = { session_id: sid };
  return handleRoute({ component: "evaluations", op: "request", ids }, async () => {
    const r = parseEvaluationRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    const { status, evaluation } = await requestEvaluation(sid, r.value);
    ids.evaluation_id = evaluation.evaluation_id;
    return Response.json(evaluation, { status });
  });
}

/** `GET` → every evaluation of the session, oldest first. */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "evaluations", op: "list", ids: { session_id: sid } }, async () =>
    Response.json({ evaluations: await getEvaluations(sid) }),
  );
}
