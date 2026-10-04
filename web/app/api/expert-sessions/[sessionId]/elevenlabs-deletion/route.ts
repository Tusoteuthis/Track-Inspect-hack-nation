import { join } from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionId } from "@/lib/expert/contracts";
import { deleteSessionConversations, deletionRefusal } from "@/lib/expert/elevenlabs-deletion";
import { createFileStore, knowledgeRoot } from "@/lib/expert/store";

// Deletes the ElevenLabs conversation(s) of ONE ended session that had an off-record segment.
// The ids come from that session's saved session.json, never from the request body.
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id. Use ^[a-z0-9-]{1,64}$." }, { status: 400 });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY. Add it to web/.env." }, { status: 500 });

  const store = createFileStore(knowledgeRoot(), { publicDir: join(process.cwd(), "public") });
  let snapshot;
  try {
    snapshot = await store.loadSnapshot(sessionId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  if (!snapshot) return NextResponse.json({ error: `No saved session ${sessionId}.` }, { status: 404 });
  const refusal = deletionRefusal(snapshot);
  if (refusal) return NextResponse.json({ error: `Not deleted: ${refusal}.` }, { status: 409 });

  const client = new ElevenLabsClient({ apiKey });
  const report = await deleteSessionConversations(snapshot, id => client.conversationalAi.conversations.delete(id));
  await store.saveDeletionReport(report);
  return NextResponse.json(report);
}
