import { NextResponse, type NextRequest } from "next/server";
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { handleRoute } from "@/lib/backend/route";
import { requireActiveSession } from "@/lib/backend/sessions";
import { FLOWS, isFlow, type Flow } from "@/lib/voice/flows";

// Issues a short-lived WebRTC conversation token so the API key never reaches the browser.
// With `?session_id=` the token is only issued for an active WS6 session (WS6 error envelope on
// failure) and the response echoes `session_id`; without it, behaviour is unchanged.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function agentIdFor(flow: Flow): string | null {
  for (const envVar of FLOWS[flow].envVars) {
    const id = process.env[envVar]?.trim();
    if (id) return id;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY. Add it to web/.env." },
      { status: 500 }
    );
  }

  const flow = request.nextUrl.searchParams.get("flow") ?? "expert";
  if (!isFlow(flow)) {
    return NextResponse.json(
      { error: `Unknown flow "${flow}". Use one of: ${Object.keys(FLOWS).join(", ")}.` },
      { status: 400 }
    );
  }

  const agentId = agentIdFor(flow);
  if (!agentId) {
    return NextResponse.json(
      { error: `Missing ${FLOWS[flow].envVars[0]}. Add it to web/.env.` },
      { status: 500 }
    );
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (sessionId === null) {
    return handleRoute({ component: "voice", op: "conversation-token" }, () => issueToken(apiKey, agentId));
  }

  return handleRoute({ component: "voice", op: "conversation-token", ids: { session_id: sessionId } }, async () => {
    await requireActiveSession(sessionId);
    return issueToken(apiKey, agentId, { session_id: sessionId });
  });
}

async function issueToken(apiKey: string, agentId: string, extra: { session_id?: string } = {}) {
  try {
    const client = new ElevenLabsClient({ apiKey });
    const res = await client.conversationalAi.conversations.getWebrtcToken({ agentId });
    return NextResponse.json({ token: res.token, ...extra });
  } catch (err) {
    const status = err instanceof ElevenLabsError && err.statusCode ? err.statusCode : 502;
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
