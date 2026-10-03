import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfig, setConfigForTests } from "./config";
import { ApiError } from "./errors";
import { handleRoute, readJsonBody } from "./route";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-route-"));
  setConfigForTests({ runtimeDir: dir });
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

async function diagLines(): Promise<Record<string, unknown>[]> {
  const [file] = await fsp.readdir(path.join(dir, "diag"));
  const text = await fsp.readFile(path.join(dir, "diag", file), "utf8");
  return text.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("handleRoute", () => {
  it("passes the response through and logs an ok line", async () => {
    const res = await handleRoute({ component: "events", op: "put", ids: { session_id: "ses-1" } }, async () =>
      Response.json({ ok: 1 }, { status: 201 }),
    );
    expect(res.status).toBe(201);
    const [line] = await diagLines();
    expect(line).toMatchObject({ component: "events", op: "put", ids: { session_id: "ses-1" }, outcome: "ok" });
    expect(line.error_code).toBeUndefined();
  });

  it("maps ApiError to the envelope and logs its code", async () => {
    const res = await handleRoute({ component: "events", op: "put" }, async () => {
      throw new ApiError("asset_not_available", "Asset not stored.", { asset_id: "a-1" });
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "asset_not_available", message: "Asset not stored.", details: { asset_id: "a-1" } },
    });
    expect((await diagLines())[0]).toMatchObject({ outcome: "error", error_code: "asset_not_available" });
  });

  it("maps unknown errors to 500 internal without leaking the message", async () => {
    const res = await handleRoute({ component: "events", op: "put" }, async () => {
      throw new Error("/secret/path expert words");
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
    expect((await diagLines())[0]).toMatchObject({ error_code: "internal" });
  });

  it("drops invalid path ids from the diag line", async () => {
    await handleRoute({ component: "events", op: "get", ids: { event_id: "../etc" } }, async () => new Response(null));
    expect((await diagLines())[0].ids).toEqual({});
  });
});

describe("readJsonBody", () => {
  it("rejects malformed JSON with validation_failed", async () => {
    const req = new Request("http://x/", { method: "POST", body: "{nope" });
    await expect(readJsonBody(req)).rejects.toMatchObject({ code: "validation_failed" });
  });
});
