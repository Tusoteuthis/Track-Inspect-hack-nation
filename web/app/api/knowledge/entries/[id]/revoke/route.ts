import { revokeEntry } from "@/lib/backend/cascade";
import { ApiError } from "@/lib/backend/errors";
import { handleRoute, readJsonBody } from "@/lib/backend/route";
import { parseRevokeRequest } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * `POST` `{ reason, revision_id? }` → `{ entry, revoked_revision_id, cascade }`. Revoked is terminal
 * (WS5); repeating it is a no-op `200`. Newcomer evaluations taught from it become stale.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return handleRoute({ component: "cascade", op: "revoke", ids: { entry_id: id } }, async () => {
    const r = parseRevokeRequest(await readJsonBody(request));
    if (!r.ok) throw new ApiError("validation_failed", r.error.message, { issues: r.error.issues });
    return Response.json(await revokeEntry(id, r.value));
  });
}
