import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfig, setConfigForTests } from "@/lib/backend/config";
import { changeLifecycle, createSession } from "@/lib/backend/sessions";

const getWebrtcToken = vi.fn(async (_req: { agentId: string }) => ({ token: "tok" }));

vi.mock("@elevenlabs/elevenlabs-js", () => {
  class ElevenLabsError extends Error {
    statusCode?: number;
  }
  class ElevenLabsClient {
    conversationalAi = { conversations: { getWebrtcToken } };
    constructor(_opts: { apiKey: string }) {}
  }
  return { ElevenLabsClient, ElevenLabsError };
});

const { GET } = await import("./route");

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-token-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key-123");
  vi.stubEnv("ELEVENLABS_AGENT_ID_EXPERT", "agent-x");
  getWebrtcToken.mockClear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

const req = (query: string) => new NextRequest(`http://localhost/api/conversation-token?${query}`);

async function newSession() {
  const { session } = await createSession({ role: "expert", source: "fixture", trace_ref: null });
  return session;
}

describe("GET /api/conversation-token", () => {
  it("without session_id returns exactly { token } (unchanged behaviour) and logs a diag line", async () => {
    const res = await GET(req("flow=expert"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('{"token":"tok"}');
    expect(text).not.toContain("test-key-123");
    expect(getWebrtcToken).toHaveBeenCalledWith({ agentId: "agent-x" });
    expect(await fsp.readdir(path.join(dir, "runtime", "diag"))).toHaveLength(1);
  });

  it("unknown session → 404 not_found and no token is requested", async () => {
    const res = await GET(req("flow=expert&session_id=ses-nope"));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("not_found");
    expect(text).not.toContain("test-key-123");
    expect(getWebrtcToken).not.toHaveBeenCalled();
  });

  it("invalid session id → 400 validation_failed", async () => {
    const res = await GET(req("flow=expert&session_id=..%2Fetc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
    expect(getWebrtcToken).not.toHaveBeenCalled();
  });

  it("created (not started) session → 409 invalid_transition", async () => {
    const s = await newSession();
    const res = await GET(req(`flow=expert&session_id=${s.session_id}`));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("invalid_transition");
    expect(getWebrtcToken).not.toHaveBeenCalled();
  });

  it("active session → { token, session_id } and a diag line", async () => {
    const s = await newSession();
    await changeLifecycle(s.session_id, { action: "start", rev: 1 });
    const res = await GET(req(`flow=expert&session_id=${s.session_id}`));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ token: "tok", session_id: s.session_id });
    expect(text).not.toContain("test-key-123");

    const diagDir = path.join(dir, "runtime", "diag");
    const content = (
      await Promise.all((await fsp.readdir(diagDir)).map((f) => fsp.readFile(path.join(diagDir, f), "utf8")))
    ).join("");
    const lines = content.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.some((l) => l.ids.session_id === s.session_id && l.outcome === "ok")).toBe(true);
    expect(content).not.toContain("tok\"");
  });
});
