import { ApiError } from "@/lib/backend/errors";
import { getLearnerDraft, putLearnerDraft } from "@/lib/backend/learner";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { getSession } from "@/lib/backend/sessions";
import { getSessionDraft } from "@/lib/backend/synthesis";
import { parsePutLearnerDraftRequest } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/** Expert session → synthesis draft view (S2); newcomer session → current `LearnerDraft` (S3). */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "drafts", op: "get", ids: { session_id: sid } }, async () => {
    const session = await getSession(sid);
    return Response.json(session.role === "newcomer" ? await getLearnerDraft(sid) : await getSessionDraft(sid));
  });
}

/** `PUT` `{ base_draft_rev, decision, reason, visual_context }` → `LearnerDraft` with `draft_rev = base + 1`. */
export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "drafts", op: "put", ids: { session_id: sid } }, async () => {
    const r = parsePutLearnerDraftRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    const { status, draft } = await putLearnerDraft(sid, r.value);
    return Response.json(draft, { status });
  });
}
