import { readFileSync, promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfig, setConfigForTests } from "@/lib/backend/config";
import { createSession } from "@/lib/backend/sessions";
import { GET as getMeta } from "./[aid]/route";
import { GET as getHighlighted } from "./[aid]/highlighted/route";
import { GET as getOriginal } from "./[aid]/original/route";
import { PUT } from "../sessions/[sid]/assets/[aid]/route";

const ORIGINAL = new Uint8Array(readFileSync(path.join(process.cwd(), "fixtures", "ws6", "fixture-frame.png")));
const META = {
  kind: "frame",
  captured_at_utc: "2026-10-03T10:00:05.000Z",
  source: "fixture",
  original: { width_px: 320, height_px: 180 },
};

let dir: string;
let sid: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-asset-routes-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
  sid = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

const aidCtx = (aid: string) => ({ params: Promise.resolve({ aid }) });

function put(aid: string, meta: unknown = META, original: Uint8Array<ArrayBuffer> | null = ORIGINAL): Promise<Response> {
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  if (original) form.set("original", new Blob([original], { type: "image/png" }), "frame.png");
  const request = new Request(`http://localhost/api/sessions/${sid}/assets/${aid}`, { method: "PUT", body: form });
  return PUT(request, { params: Promise.resolve({ sid, aid }) });
}

const get = (url: string) => new Request(`http://localhost${url}`);

describe("asset routes", () => {
  it("PUT stores (201), repeats (200); GET returns meta and bytes", async () => {
    const first = await put("asset-1");
    expect(first.status).toBe(201);
    const asset = (await first.json()) as { asset_id: string; original: { sha256: string } };
    expect(asset.asset_id).toBe("asset-1");
    expect((await put("asset-1")).status).toBe(200);

    const meta = await getMeta(get("/api/assets/asset-1"), aidCtx("asset-1"));
    expect(meta.status).toBe(200);
    expect(await meta.json()).toEqual(asset);
    expect(meta.headers.get("cache-control")).toContain("private");

    const bytes = await getOriginal(get("/api/assets/asset-1/original"), aidCtx("asset-1"));
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get("content-type")).toBe("image/png");
    expect(bytes.headers.get("cache-control")).toContain("private");
    expect(bytes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(bytes.headers.get("etag")).toBe(`"${asset.original.sha256}"`);
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(ORIGINAL);
  });

  it("GET highlighted on an asset without one → 404 envelope", async () => {
    await put("asset-2");
    const res = await getHighlighted(get("/api/assets/asset-2/highlighted"), aidCtx("asset-2"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("unknown aid → 404, invalid aid → 400", async () => {
    expect((await getMeta(get("/api/assets/nope"), aidCtx("nope"))).status).toBe(404);
    expect((await getOriginal(get("/api/assets/nope/original"), aidCtx("nope"))).status).toBe(404);
    const bad = await getMeta(get("/api/assets/.."), aidCtx(".."));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("PUT rejects malformed meta, missing original and oversized bodies", async () => {
    const form = new FormData();
    form.set("meta", "{not json");
    form.set("original", new Blob([ORIGINAL], { type: "image/png" }), "frame.png");
    const malformed = await PUT(new Request("http://localhost/x", { method: "PUT", body: form }), {
      params: Promise.resolve({ sid, aid: "asset-3" }),
    });
    expect(malformed.status).toBe(400);
    expect((await put("asset-3", META, null)).status).toBe(400);

    setConfigForTests({ assetMaxBytes: 10 });
    const big = await PUT(
      new Request("http://localhost/x", { method: "PUT", body: "x", headers: { "Content-Length": "1000000" } }),
      { params: Promise.resolve({ sid, aid: "asset-3" }) },
    );
    expect(big.status).toBe(400);
    expect(await big.json()).toMatchObject({ error: { code: "validation_failed", message: "Request body is too large." } });
    const notMultipart = await PUT(
      new Request("http://localhost/x", { method: "PUT", body: "plain", headers: { "Content-Type": "text/plain" } }),
      { params: Promise.resolve({ sid, aid: "asset-3" }) },
    );
    expect(notMultipart.status).toBe(400);
  });
});
