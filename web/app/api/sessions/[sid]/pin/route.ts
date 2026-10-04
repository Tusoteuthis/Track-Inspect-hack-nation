import { repinSession } from "@/lib/backend/learner";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/** `POST` → re-pin a newcomer session to the knowledge eligible now; earlier evaluations become stale. */
export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const { sid } = await ctx.params;
  return handleRoute({ component: "sessions", op: "repin", ids: { session_id: sid } }, async () => Response.json(await repinSession(sid)));
}
