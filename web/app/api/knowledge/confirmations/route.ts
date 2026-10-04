import { postConfirmation } from "@/lib/backend/confirmations";
import { handleRoute, readJsonBody } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRoute({ component: "knowledge", op: "post_confirmation" }, async () => {
    const { status, confirmations } = await postConfirmation(await readJsonBody(request));
    return Response.json({ confirmations }, { status });
  });
}
