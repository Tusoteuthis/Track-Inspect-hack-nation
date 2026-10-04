import { handleRoute } from "@/lib/backend/route";
import { getWorkMap } from "@/lib/backend/workmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirmed content by default; `?include=draft` adds drafts and unresolved entries. */
export async function GET(request: Request): Promise<Response> {
  const include = new URL(request.url).searchParams.get("include") === "draft" ? "draft" : "confirmed";
  return handleRoute({ component: "knowledge", op: "get_workmap" }, async () => Response.json(await getWorkMap(include)));
}
