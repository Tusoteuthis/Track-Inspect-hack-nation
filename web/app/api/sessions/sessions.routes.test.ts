import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfig, setConfigForTests } from "@/lib/backend/config";
import { POST as createRoute } from "./route";
import { GET as getRoute } from "./[sid]/route";
import { POST as lifecycleRoute } from "./[sid]/lifecycle/route";
import { POST as recordStateRoute } from "./[sid]/record-state/route";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-sroutes-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

const BASE = "http://localhost/api/sessions";

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (sid: string) => ({ params: Promise.resolve({ sid }) });

async function create(headers: Record<string, string> = {}) {
  const res = await createRoute(post(BASE, { role: "expert", source: "fixture" }, headers));
  return { res, body: await res.json() };
}

async function lifecycle(sid: string, action: string, rev: number) {
  return lifecycleRoute(post(`${BASE}/${sid}/lifecycle`, { action, rev }), ctx(sid));
}

describe("POST /api/sessions", () => {
  it("creates a session → 201 with the Session shape", async () => {
    const { res, body } = await create();
    expect(res.status).toBe(201);
    expect(body.session_id).toMatch(/^ses-\d{14}-[a-z0-9]{6}$/);
    expect(body).toMatchObject({
      role: "expert",
      lifecycle: "created",
      record_state: "on_record",
      case_id: null,
      trace_ref: null,
      pinned_knowledge: null,
      source: "fixture",
      rev: 1,
    });
    expect(body.recording_segments).toHaveLength(1);
    expect(typeof body.created_at_utc).toBe("string");
  });

  it("replays the same Idempotency-Key → 200 with the same session_id", async () => {
    const a = await create({ "Idempotency-Key": "k-1" });
    const b = await create({ "Idempotency-Key": "k-1" });
    expect(a.res.status).toBe(201);
    expect(b.res.status).toBe(200);
    expect(b.body.session_id).toBe(a.body.session_id);
  });

  it("rejects a newcomer role → 400 validation_failed with issues", async () => {
    const res = await createRoute(post(BASE, { role: "newcomer" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
  });

  it("rejects malformed JSON → 400", async () => {
    const res = await createRoute(post(BASE, "{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("writes a diag line with component sessions", async () => {
    const { body: created } = await create();
    const diagDir = path.join(dir, "runtime", "diag");
    const files = (await fsp.readdir(diagDir)).filter((f) => f.endsWith(".ndjson"));
    expect(files.length).toBeGreaterThan(0);
    const lines = (await Promise.all(files.map((f) => fsp.readFile(path.join(diagDir, f), "utf8"))))
      .join("")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const line = lines.find((l) => l.component === "sessions" && l.op === "create");
    expect(line).toMatchObject({ outcome: "ok", ids: { session_id: created.session_id } });
  });
});

describe("GET /api/sessions/:sid", () => {
  it("returns 200 with the session", async () => {
    const { body: created } = await create();
    const res = await getRoute(new Request(`${BASE}/${created.session_id}`), ctx(created.session_id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it("returns 404 for an unknown session", async () => {
    const res = await getRoute(new Request(`${BASE}/ses-unknown`), ctx("ses-unknown"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 400 for a path-traversal id", async () => {
    const res = await getRoute(new Request(`${BASE}/..%2Fetc`), ctx("../etc"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });
});

describe("POST /api/sessions/:sid/lifecycle", () => {
  it("start → 200 active; start after end → 409 invalid_transition envelope", async () => {
    const { body: s } = await create();
    const started = await lifecycle(s.session_id, "start", 1);
    expect(started.status).toBe(200);
    const sb = await started.json();
    expect(sb).toMatchObject({ lifecycle: "active", rev: 2 });

    const ended = await lifecycle(s.session_id, "end", 2);
    expect(ended.status).toBe(200);
    expect((await ended.json()).lifecycle).toBe("ended");

    const again = await lifecycle(s.session_id, "start", 3);
    expect(again.status).toBe(409);
    const err = await again.json();
    expect(Object.keys(err)).toEqual(["error"]);
    expect(err.error.code).toBe("invalid_transition");
    expect(typeof err.error.message).toBe("string");
  });

  it("stale rev → 409 stale_revision", async () => {
    const { body: s } = await create();
    await lifecycle(s.session_id, "start", 1);
    const res = await lifecycle(s.session_id, "end", 1);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("stale_revision");
  });

  it("invalid body → 400", async () => {
    const { body: s } = await create();
    const res = await lifecycleRoute(post(`${BASE}/${s.session_id}/lifecycle`, { action: "fly", rev: 1 }), ctx(s.session_id));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/sessions/:sid/record-state", () => {
  it("off_record → 200 with 2 segments", async () => {
    const { body: s } = await create();
    await lifecycle(s.session_id, "start", 1);
    const res = await recordStateRoute(
      post(`${BASE}/${s.session_id}/record-state`, { state: "off_record" }),
      ctx(s.session_id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record_state).toBe("off_record");
    expect(body.recording_segments).toHaveLength(2);
  });

  it("invalid state → 400", async () => {
    const { body: s } = await create();
    const res = await recordStateRoute(
      post(`${BASE}/${s.session_id}/record-state`, { state: "maybe" }),
      ctx(s.session_id),
    );
    expect(res.status).toBe(400);
  });
});
