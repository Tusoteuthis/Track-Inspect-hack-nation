import { checkHealth } from "@/lib/backend/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await checkHealth();
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
