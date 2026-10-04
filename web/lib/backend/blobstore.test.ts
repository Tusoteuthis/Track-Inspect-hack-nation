import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsBlobStore, R2BlobStore, getBlobStore, setBlobStoreForTests, setR2Bucket, toKey, type BlobStore, type R2BucketLike } from "./blobstore";
import { resetConfig, setConfigForTests } from "./config";

/** In-memory stand-in for the Workers R2 binding (list honours prefix/delimiter/limit). */
function fakeBucket(): R2BucketLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const obj = (v: string) => ({ text: async () => v, arrayBuffer: async () => new TextEncoder().encode(v).buffer as ArrayBuffer });
  return {
    data,
    get: async (k) => (data.has(k) ? obj(data.get(k)!) : null),
    head: async (k) => (data.has(k) ? { key: k, size: data.get(k)!.length } : null),
    put: async (k, v) => void data.set(k, typeof v === "string" ? v : new TextDecoder().decode(v)),
    delete: async (ks) => void [ks].flat().forEach((k) => data.delete(k)),
    list: async ({ prefix = "", delimiter, limit }) => {
      const objects: { key: string; size: number }[] = [];
      const prefixes = new Set<string>();
      for (const k of [...data.keys()].sort()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const cut = delimiter ? rest.indexOf(delimiter) : -1;
        if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1));
        else objects.push({ key: k, size: data.get(k)!.length });
      }
      return { objects: limit ? objects.slice(0, limit) : objects, delimitedPrefixes: [...prefixes], truncated: false };
    },
  };
}

let root: string;
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "blobstore-"));
  setConfigForTests({
    knowledgeDir: path.join(root, "knowledge"),
    runtimeDir: path.join(root, "runtime"),
    evaluatorDir: path.join(root, "runtime", "evaluator"),
    casesDir: path.join(root, "cases"),
  });
});
afterEach(async () => {
  setBlobStoreForTests(undefined);
  resetConfig();
  await fsp.rm(root, { recursive: true, force: true });
});

describe("toKey", () => {
  it("maps configured roots to prefixed POSIX keys", () => {
    expect(toKey(path.join(root, "knowledge", "sessions", "s1", "session.json"))).toBe("knowledge/sessions/s1/session.json");
    expect(toKey(path.join(root, "runtime", "jobs", "j.json"))).toBe("runtime/jobs/j.json");
    expect(toKey(path.join(root, "cases", "c1", "case.json"))).toBe("cases/c1/case.json");
  });
  it("refuses the evaluator dir and anything outside the roots", () => {
    expect(() => toKey(path.join(root, "runtime", "evaluator", "key.json"))).toThrow("Not available");
    expect(() => toKey(path.join(root, "elsewhere.json"))).toThrow("Not available");
    expect(() => toKey(path.join(root, "knowledge", "..", "x.json"))).toThrow("Not available");
  });
});

for (const [name, make] of [
  ["fs", () => new FsBlobStore()],
  ["r2", () => new R2BlobStore(fakeBucket())],
] as const) {
  describe(`${name} BlobStore contract`, () => {
    let store: BlobStore;
    const k = (...parts: string[]) => path.join(root, "knowledge", ...parts);
    beforeEach(() => {
      store = make();
    });

    it("put/get round-trips text and bytes; missing is null", async () => {
      expect(await store.getText(k("a.json"))).toBeNull();
      await store.put(k("d", "a.json"), "one");
      await store.put(k("d", "a.json"), "two");
      expect(await store.getText(k("d", "a.json"))).toBe("two");
      expect(new TextDecoder().decode((await store.getBytes(k("d", "a.json")))!)).toBe("two");
    });

    it("appends lines", async () => {
      await store.append(k("s", "bus.ndjson"), "1\n");
      await store.append(k("s", "bus.ndjson"), "2\n");
      expect(await store.getText(k("s", "bus.ndjson"))).toBe("1\n2\n");
    });

    it("lists immediate children with a dir flag; missing dir is []", async () => {
      expect(await store.list(k("none"))).toEqual([]);
      await store.put(k("e", "x.json"), "{}");
      await store.put(k("e", "sub", "y.json"), "{}");
      const names = (await store.list(k("e"))).sort((a, b) => a.name.localeCompare(b.name));
      expect(names).toEqual([{ name: "sub", isDir: true }, { name: "x.json", isDir: false }]);
    });

    it("stat, delete and deleteTree", async () => {
      await store.put(k("t", "a", "b.json"), "{}");
      await store.put(k("t", "c.json"), "{}");
      expect((await store.stat(k("t", "c.json")))?.kind).toBe("file");
      expect((await store.stat(k("t", "a")))?.kind).toBe("dir");
      await store.delete(k("t", "c.json"));
      await store.delete(k("t", "missing.json"));
      expect(await store.stat(k("t", "c.json"))).toBeNull();
      await store.deleteTree(k("t"));
      await store.deleteTree(k("t"));
      expect(await store.stat(k("t", "a", "b.json"))).toBeNull();
    });

    it("realpath is null for missing files", async () => {
      expect(await store.realpath(k("nope"))).toBeNull();
      await store.put(k("r.json"), "{}");
      expect(await store.realpath(k("r.json"))).toBeTruthy();
    });

    it("reports writable roots", async () => {
      expect(await store.checkWritable(k())).toBe(true);
    });
  });
}

describe("getBlobStore", () => {
  it("defaults to fs and selects r2 only with a bucket", () => {
    const prev = process.env.STORAGE_BACKEND;
    try {
      delete process.env.STORAGE_BACKEND;
      setBlobStoreForTests(undefined);
      expect(getBlobStore().kind).toBe("fs");
      process.env.STORAGE_BACKEND = "r2";
      setBlobStoreForTests(undefined);
      setR2Bucket(fakeBucket());
      expect(getBlobStore().kind).toBe("r2");
    } finally {
      if (prev === undefined) delete process.env.STORAGE_BACKEND;
      else process.env.STORAGE_BACKEND = prev;
    }
  });
});
