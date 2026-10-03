import { NextResponse, type NextRequest } from "next/server";
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { FLOWS, isFlow, type Flow } from "@/lib/voice/flows";

// Issues a short-lived WebRTC conversation token so the API key never reaches the browser.
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

  try {
    const client = new ElevenLabsClient({ apiKey });
    const res = await client.conversationalAi.conversations.getWebrtcToken({ agentId });
    return NextResponse.json({ token: res.token });
  } catch (err) {
    const status = err instanceof ElevenLabsError && err.statusCode ? err.statusCode : 502;
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
