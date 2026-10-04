import { listEntries } from "@/lib/backend/knowledge";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleRoute({ component: "knowledge", op: "list_entries" }, async () => Response.json(await listEntries()));
}
