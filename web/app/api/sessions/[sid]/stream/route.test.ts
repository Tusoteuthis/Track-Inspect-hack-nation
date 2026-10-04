import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendBus } from "@/lib/backend/bus";
import { resetConfig, setConfigForTests } from "@/lib/backend/config";
import { createSession } from "@/lib/backend/sessions";
import { flushStreamLogs } from "@/lib/backend/sse";
import { GET } from "./route";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-stream-route-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
});

afterEach(async () => {
  await flushStreamLogs();
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

const ctx = (sid: string) => ({ params: Promise.resolve({ sid }) });

describe("GET /api/sessions/:sid/stream", () => {
  it("streams events after Last-Event-ID as text/event-stream", async () => {
    const { session } = await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null });
    const sid = session.session_id;
    for (let i = 1; i <= 3; i++) await appendBus(sid, "event.stored", { event_id: `evt-00${i}` });

    const ac = new AbortController();
    const req = new Request(`http://localhost/api/sessions/${sid}/stream`, {
      headers: { "Last-Event-ID": "1" },
      signal: ac.signal,
    });
    const res = await GET(req, ctx(sid));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toContain("no-cache");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 2000;
    while (!/(^|\n)id: 3\n/.test(text)) {
      if (Date.now() > deadline) throw new Error(`timeout; got ${JSON.stringify(text)}`);
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    const ids = [...text.matchAll(/(?:^|\n)id: (\d+)\n/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([2, 3]);
    expect(text).not.toMatch(/(^|\n)id: 1\n/);

    ac.abort();
    const end = await reader.read();
    expect(end.done).toBe(true);
  });

  it("404s with the error envelope for an unknown session", async () => {
    const res = await GET(new Request("http://localhost/api/sessions/ses-nope/stream"), ctx("ses-nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("400s for an unsafe session id", async () => {
    const res = await GET(new Request("http://localhost/api/sessions/x/stream"), ctx("../etc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "validation_failed" } });
  });
});
