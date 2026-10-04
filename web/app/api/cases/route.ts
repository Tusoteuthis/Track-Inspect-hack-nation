import { listLearnerCases } from "@/lib/backend/cases";
import { ApiError } from "@/lib/backend/errors";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/cases[?for=expert|newcomer]` — learner views of every usable case (integration G7). */
export async function GET(request: Request): Promise<Response> {
  return handleRoute({ component: "cases", op: "list", ids: {} }, async () => {
    const audience = new URL(request.url).searchParams.get("for");
    if (audience !== null && audience !== "expert" && audience !== "newcomer") {
      throw new ApiError("validation_failed", "for must be expert or newcomer.", { field: "for" });
    }
    return Response.json(await listLearnerCases(audience ?? undefined));
  });
}
