import { getRevisionView } from "@/lib/backend/knowledge";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; rev: string }> };

/** `{ revision, status, markdown }`: immutable frontmatter, the status now, the module Markdown. */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id, rev } = await ctx.params;
  return handleRoute({ component: "knowledge", op: "get_revision", ids: { entry_id: id, revision_id: rev } }, async () =>
    Response.json(await getRevisionView(id, rev)),
  );
}
