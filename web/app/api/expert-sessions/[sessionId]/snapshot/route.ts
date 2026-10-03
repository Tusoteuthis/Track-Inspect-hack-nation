import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionId, validateSessionSnapshot } from "@/lib/expert/contracts";
import { createFileStore, knowledgeRoot } from "@/lib/expert/store";

// Saves the full state of one expert session. The client always sends the whole
// snapshot, so retries overwrite instead of duplicating records.
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id. Use ^[a-z0-9-]{1,64}$." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const result = validateSessionSnapshot(body);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid session snapshot.", details: result.errors }, { status: 400 });
  }
  if (result.value.session_id !== sessionId) {
    return NextResponse.json({ error: "session_id in the body does not match the URL." }, { status: 400 });
  }

  try {
    const store = createFileStore(knowledgeRoot(), { publicDir: join(process.cwd(), "public") });
    const { files } = await store.saveSnapshot(result.value);
    return NextResponse.json({ saved_at: new Date().toISOString(), files });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not save the session: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
