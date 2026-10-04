import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "./errors";
import {
  canonicalJson,
  putImmutable,
  putMutable,
  readJson,
  writeFileAtomic,
  writeJsonAtomic,
} from "./store";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-store-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(dir, { recursive: true, force: true });
});

const tmpFiles = async (d: string) => (await fsp.readdir(d)).filter((f) => f.endsWith(".tmp"));

async function expectApiError(p: Promise<unknown>, code: string): Promise<ApiError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
  return err as ApiError;
}

const Rec = z.object({ id: z.string(), n: z.number() });

describe("writeJsonAtomic / readJson", () => {
  it("round-trips through nested, not-yet-existing directories", async () => {
    const target = path.join(dir, "a", "b", "rec.json");
    await writeJsonAtomic(target, { id: "x", n: 1 });
    expect(await readJson(target, Rec)).toEqual({ id: "x", n: 1 });
    expect(await fsp.readFile(target, "utf8")).toBe('{\n  "id": "x",\n  "n": 1\n}\n');
    expect(await tmpFiles(path.dirname(target))).toEqual([]);
  });

  it("leaves a fresh target absent and no temp file when rename fails", async () => {
    const target = path.join(dir, "fresh.json");
    vi.spyOn(fsp, "rename").mockRejectedValueOnce(new Error("rename failed"));
    await expect(writeJsonAtomic(target, { id: "x", n: 1 })).rejects.toThrow("rename failed");
    await expect(fsp.access(target)).rejects.toThrow();
    expect(await tmpFiles(dir)).toEqual([]);
  });

  it("keeps the previous content and no temp file when rename fails", async () => {
    const target = path.join(dir, "existing.json");
    await writeJsonAtomic(target, { id: "x", n: 1 });
    vi.spyOn(fsp, "rename").mockRejectedValueOnce(new Error("rename failed"));
    await expect(writeFileAtomic(target, "garbage")).rejects.toThrow("rename failed");
    expect(await readJson(target, Rec)).toEqual({ id: "x", n: 1 });
    expect(await tmpFiles(dir)).toEqual([]);
  });

  it("returns null for a missing file", async () => {
    expect(await readJson(path.join(dir, "nope.json"), Rec)).toBeNull();
  });

  it("raises validation_failed for invalid JSON without leaking content", async () => {
    const target = path.join(dir, "bad.json");
    await fsp.writeFile(target, "{ secret-content");
    const err = await expectApiError(readJson(target, Rec), "validation_failed");
    expect(JSON.stringify(err.details ?? {}) + err.message).not.toContain("secret-content");
  });

  it("raises validation_failed on schema mismatch", async () => {
    const target = path.join(dir, "wrong.json");
    await fsp.writeFile(target, JSON.stringify({ id: 1 }));
    await expectApiError(readJson(target, Rec), "validation_failed");
  });
});

describe("canonicalJson", () => {
  it("sorts keys recursively and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe("putImmutable", () => {
  it("creates, accepts identical retries, and rejects different bodies", async () => {
    const target = path.join(dir, "imm.json");
    const first = await putImmutable(target, { id: "x", n: 1 }, Rec);
    expect(first).toEqual({ status: 201, record: { id: "x", n: 1 } });

    const retry = await putImmutable(target, { n: 1, id: "x" }, Rec);
    expect(retry).toEqual({ status: 200, record: { id: "x", n: 1 } });

    const before = await fsp.readFile(target, "utf8");
    await expectApiError(putImmutable(target, { id: "x", n: 2 }, Rec), "conflict_immutable");
    expect(await fsp.readFile(target, "utf8")).toBe(before);
  });

  it("yields exactly one 201 and one 200 for concurrent identical creates", async () => {
    const target = path.join(dir, "race.json");
    const results = await Promise.all([
      putImmutable(target, { id: "x", n: 1 }),
      putImmutable(target, { id: "x", n: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await fsp.readdir(dir)).filter((f) => f.startsWith("race"))).toEqual(["race.json"]);
  });
});

describe("putMutable", () => {
  type Doc = { id: string; rev: number; body: string };
  const doc = (rev: number, body = "v"): Doc => ({ id: "d", rev, body });

  it("enforces increasing revs with idempotent equal-rev retries", async () => {
    const target = path.join(dir, "mut.json");
    expect(await putMutable(target, doc(1))).toEqual({ status: 201, record: doc(1) });

    expect(await putMutable(target, doc(3, "w"))).toEqual({ status: 200, record: doc(3, "w") });
    expect(JSON.parse(await fsp.readFile(target, "utf8"))).toEqual(doc(3, "w"));

    const lower = await expectApiError(putMutable(target, doc(2)), "stale_revision");
    expect(lower.details).toEqual({ stored_rev: 3, received_rev: 2 });

    await expectApiError(putMutable(target, doc(3, "different")), "stale_revision");

    const noop = await putMutable(target, { body: "w", rev: 3, id: "d" });
    expect(noop).toEqual({ status: 200, record: doc(3, "w") });
    expect(JSON.parse(await fsp.readFile(target, "utf8"))).toEqual(doc(3, "w"));
  });

  it("supports a custom rev accessor such as draft_rev", async () => {
    type Draft = { draft_id: string; draft_rev: number; text: string };
    const target = path.join(dir, "draft.json");
    const revOf = (d: Draft) => d.draft_rev;
    const d = (draft_rev: number, text = "t"): Draft => ({ draft_id: "dr", draft_rev, text });

    expect((await putMutable(target, d(1), { revOf })).status).toBe(201);
    expect((await putMutable(target, d(2, "u"), { revOf })).status).toBe(200);
    const err = await expectApiError(putMutable(target, d(1), { revOf }), "stale_revision");
    expect(err.details).toEqual({ stored_rev: 2, received_rev: 1 });
  });
});
