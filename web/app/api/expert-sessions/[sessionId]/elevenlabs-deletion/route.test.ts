import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toSnapshot } from "@/lib/expert/session";
import { createFileStore } from "@/lib/expert/store";
import { confirmedSession, fullSession } from "@/lib/expert/test-driver";

const deleteMock = vi.fn(async (_id: string): Promise<unknown> => ({}));
vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = { conversations: { delete: deleteMock } };
  },
}));

const { POST } = await import("./route");

let root: string;
const env = { ...process.env };
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ws3-del-route-"));
  process.env.KNOWLEDGE_DIR = root;
  process.env.ELEVENLABS_API_KEY = "test-key";
  deleteMock.mockClear();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.env = { ...env };
});

const call = (sessionId: string) =>
  POST(new NextRequest(`http://localhost/api/expert-sessions/${sessionId}/elevenlabs-deletion`, { method: "POST" }), {
    params: Promise.resolve({ sessionId }),
  });

describe("POST /api/expert-sessions/[sessionId]/elevenlabs-deletion", () => {
  it("deletes only the conversation ids saved for that session and stores the report", async () => {
    const snap = toSnapshot(fullSession("ses-20261004-150000-rt01").state);
    const other = toSnapshot(fullSession("ses-20261004-150000-rt02").state);
    const store = createFileStore(root);
    await store.saveSnapshot(snap);
    await store.saveSnapshot({ ...other, conversation_ids: ["conv_other"], conversation_id: "conv_other" });

    const res = await call(snap.session_id);
    expect(res.status).toBe(200);
    expect(deleteMock.mock.calls.map(c => c[0])).toEqual(["conv_test_0001"]);
    const body = await res.json();
    expect(body.results).toEqual([{ conversation_id: "conv_test_0001", status: "deleted", detail: null }]);
    const saved = JSON.parse(readFileSync(join(root, "sessions", snap.session_id, "elevenlabs-deletion.json"), "utf8"));
    expect(saved).toEqual([body]);
  });

  it("refuses without calling ElevenLabs: unknown session, bad id, no off-record segment, still running", async () => {
    const store = createFileStore(root);
    const d = confirmedSession("ses-20261004-150000-rt03");
    d.act({ type: "connected", conversation_id: "conv_keep" });
    d.act({ type: "session_ended", cause: "stop" });
    await store.saveSnapshot(toSnapshot(d.state));
    const running = toSnapshot(fullSession("ses-20261004-150000-rt04", { end: false }).state);
    await store.saveSnapshot(running);

    expect((await call("ses-20261004-150000-none")).status).toBe(404);
    expect((await call("../etc")).status).toBe(400);
    expect((await call(d.state.session_id)).status).toBe(409);
    expect((await call(running.session_id)).status).toBe(409);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("reports a 404 from ElevenLabs as not_found", async () => {
    deleteMock.mockRejectedValueOnce(Object.assign(new Error("conversation_not_found"), { statusCode: 404 }));
    const snap = toSnapshot(fullSession("ses-20261004-150000-rt05").state);
    await createFileStore(root).saveSnapshot(snap);
    const body = await (await call(snap.session_id)).json();
    expect(body.results[0].status).toBe("not_found");
  });
});
