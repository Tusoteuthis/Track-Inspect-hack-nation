import { listReviewMarks, postReviewMark } from "@/lib/backend/review";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { getSession } from "@/lib/backend/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/** `POST /api/sessions/:sid/review-marks` — store a review mark (integration G10); never changes knowledge. */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  const ids: Record<string, string> = { session_id: sid };
  return handleRoute({ component: "review", op: "post_mark", ids }, async () => {
    const { status, mark } = await postReviewMark(sid, await readJsonBody(request));
    ids.mark_id = mark.mark_id;
    return Response.json(mark, { status });
  });
}

/** `GET /api/sessions/:sid/review-marks` — the session's marks, oldest first. */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "review", op: "list_marks", ids: { session_id: sid } }, async () => {
    await getSession(sid);
    return Response.json(await listReviewMarks(sid));
  });
}
