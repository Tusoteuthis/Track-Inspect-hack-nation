import { checkHealth } from "@/lib/backend/health";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleRoute({ component: "health", op: "get" }, async () => {
    const report = await checkHealth();
    return Response.json(report, { status: report.ok ? 200 : 503 });
  });
}
