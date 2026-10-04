import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionId } from "@/lib/expert/contracts";
import { createFileStore, knowledgeRoot } from "@/lib/expert/store";

// Re-derives demo-evidence.md from the session's saved files (not from client state) and writes it.
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id. Use ^[a-z0-9-]{1,64}$." }, { status: 400 });
  }
  try {
    const store = createFileStore(knowledgeRoot(), { publicDir: join(process.cwd(), "public") });
    const result = await store.exportDemoEvidence(sessionId);
    if (!result) return NextResponse.json({ error: `No saved session ${sessionId}.` }, { status: 404 });
    return NextResponse.json({ ...result, file: "demo-evidence.md" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
