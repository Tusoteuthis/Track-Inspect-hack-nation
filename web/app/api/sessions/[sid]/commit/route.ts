import { ApiError } from "@/lib/backend/errors";
import { commitDraft, getCommit } from "@/lib/backend/learner";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { parseCommitRequest } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/**
 * `POST` `{ draft_rev, evaluation_id, escalated?, idempotency_key }` → `201 Commit` (same key → `200`).
 * Refusals are `409` with the commit-policy code as `error.code` and `error.details.policy_code`.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  const ids: Record<string, string> = { session_id: sid };
  return handleRoute({ component: "commit", op: "commit", ids }, async () => {
    const r = parseCommitRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    if (r.value.evaluation_id) ids.evaluation_id = r.value.evaluation_id;
    const { status, commit } = await commitDraft(sid, r.value);
    ids.commit_id = commit.commit_id;
    return Response.json(commit, { status });
  });
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "commit", op: "get", ids: { session_id: sid } }, async () => Response.json(await getCommit(sid)));
}
