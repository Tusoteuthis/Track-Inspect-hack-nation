import { overviewDiagnostics, sessionDiagnostics } from "@/lib/backend/diagnostics";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/diagnostics[?session_id=]` — ID chain + per-component status. IDs and timings only. */
export async function GET(request: Request): Promise<Response> {
  const sid = new URL(request.url).searchParams.get("session_id");
  return handleRoute({ component: "diagnostics", op: "get", ids: sid ? { session_id: sid } : {} }, async () =>
    Response.json(sid ? await sessionDiagnostics(sid) : await overviewDiagnostics(), { headers: { "Cache-Control": "no-store" } }),
  );
}
