/**
 * Storage port: every byte the backend persists goes through a `BlobStore`.
 *
 * Callers keep computing absolute paths with `paths.ts` (`safeJoin`, `servable`, evaluator-dir
 * exclusion stay authoritative). `FsBlobStore` (default) uses those paths as-is, so the files on
 * disk are identical to the pre-port layout. `R2BlobStore` maps them to object keys
 * `<root>/<posix relative path>` for a fixed set of roots and refuses everything else — including
 * anything inside `EVALUATOR_DIR` — so the same invariants hold for keys.
 *
 * Selected by `STORAGE_BACKEND=fs|r2` (default fs). The r2 backend needs a bucket binding handed in
 * with `setR2Bucket()` from the Workers entry point.
 */
// Imported as the `promises` object (not the fs/promises namespace) so tests can vi.spyOn it.
import { constants, promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { withLock } from "./locks";

export type BlobStat = { kind: "file" | "dir"; size: number };
export type BlobDirEntry = { name: string; isDir: boolean };

export interface BlobStore {
  readonly kind: "fs" | "r2";
  /** Bytes, or null when missing. Other read errors throw. */
  getBytes(p: string): Promise<Uint8Array | null>;
  /** UTF-8 text, or null when missing. Other read errors throw. */
  getText(p: string): Promise<string | null>;
  /** Atomic replace: readers see the old or the new content, never a partial one. */
  put(p: string, data: string | Uint8Array): Promise<void>;
  /** Appends text (one or more NDJSON lines) to the end of `p`, creating it. */
  append(p: string, text: string): Promise<void>;
  /** Immediate children of a directory; [] when it does not exist. */
  list(dir: string): Promise<BlobDirEntry[]>;
  stat(p: string): Promise<BlobStat | null>;
  /** Removes one file; missing is fine. */
  delete(p: string): Promise<void>;
  /** `rm -rf`: removes `p` and everything below it; missing is fine. */
  deleteTree(p: string): Promise<void>;
  /** Canonical location for containment checks (fs: realpath, resolving symlinks), or null when missing. */
  realpath(p: string): Promise<string | null>;
  /** Whether new data can be written under `dir` (health check). */
  checkWritable(dir: string): Promise<boolean>;
}

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code;
}

// --- filesystem ----------------------------------------------------------------------

export class FsBlobStore implements BlobStore {
  readonly kind = "fs" as const;

  async getBytes(p: string): Promise<Uint8Array | null> {
    try {
      return await fs.readFile(p);
    } catch (err) {
      if (isErrno(err, "ENOENT")) return null;
      throw err;
    }
  }

  async getText(p: string): Promise<string | null> {
    try {
      return await fs.readFile(p, "utf8");
    } catch (err) {
      if (isErrno(err, "ENOENT")) return null;
      throw err;
    }
  }

  /** Temp file in the same directory + fsync + rename, so readers never see a partial file. */
  async put(target: string, data: string | Uint8Array): Promise<void> {
    const dir = path.dirname(target);
    await fs.mkdir(dir, { recursive: true });
    const temp = path.join(dir, `.${path.basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
    try {
      const fh = await fs.open(temp, "wx");
      try {
        await fh.writeFile(data);
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fs.rename(temp, target);
    } catch (err) {
      await fs.unlink(temp).catch(() => undefined);
      throw err;
    }
  }

  async append(p: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, text);
  }

  async list(dir: string): Promise<BlobDirEntry[]> {
    try {
      return (await fs.readdir(dir, { withFileTypes: true })).map((e) => ({ name: e.name, isDir: e.isDirectory() }));
    } catch (err) {
      if (isErrno(err, "ENOENT")) return [];
      throw err;
    }
  }

  async stat(p: string): Promise<BlobStat | null> {
    try {
      const s = await fs.stat(p);
      return { kind: s.isDirectory() ? "dir" : "file", size: s.size };
    } catch {
      return null;
    }
  }

  delete(p: string): Promise<void> {
    return fs.rm(p, { force: true });
  }

  deleteTree(p: string): Promise<void> {
    return fs.rm(p, { recursive: true, force: true });
  }

  realpath(p: string): Promise<string | null> {
    return fs.realpath(p).catch(() => null);
  }

  async checkWritable(dir: string): Promise<boolean> {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

// --- R2 ------------------------------------------------------------------------------

/** The subset of the Workers `R2Bucket` binding used here (kept local: no workers-types dependency). */
export interface R2BucketLike {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> } | null>;
  head(key: string): Promise<{ key: string; size: number } | null>;
  put(key: string, value: string | ArrayBuffer | Uint8Array): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix?: string; delimiter?: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string; size: number }[];
    delimitedPrefixes: string[];
    truncated: boolean;
    cursor?: string;
  }>;
}

const isInside = (child: string, parent: string) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * Absolute path → R2 key `<root>/<posix rel>`. Only the configured roots map; the evaluator dir and
 * anything outside the roots never does (same answer as a missing record: not found).
 */
export function toKey(p: string): string {
  const { knowledgeDir, runtimeDir, casesDir, evaluatorDir } = getConfig();
  const abs = path.resolve(p);
  if (isInside(abs, evaluatorDir)) throw new ApiError("not_found", "Not available.");
  const roots: [string, string][] = [
    ["knowledge", knowledgeDir],
    ["runtime", runtimeDir],
    ["cases", casesDir],
  ];
  // Most specific root wins (a root may be configured inside another).
  roots.sort((a, b) => b[1].length - a[1].length);
  for (const [name, root] of roots) {
    if (!isInside(abs, root)) continue;
    const rel = path.relative(path.resolve(root), abs).split(path.sep).join("/");
    return rel ? `${name}/${rel}` : name;
  }
  throw new ApiError("not_found", "Not available.");
}

export class R2BlobStore implements BlobStore {
  readonly kind = "r2" as const;
  constructor(private readonly bucket: R2BucketLike) {}

  async getBytes(p: string): Promise<Uint8Array | null> {
    const obj = await this.bucket.get(toKey(p));
    return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
  }

  async getText(p: string): Promise<string | null> {
    const obj = await this.bucket.get(toKey(p));
    return obj ? obj.text() : null;
  }

  /** A single R2 put is atomic per object: no temp + rename needed. */
  async put(p: string, data: string | Uint8Array): Promise<void> {
    await this.bucket.put(toKey(p), data);
  }

  /**
   * R2 has no append: read-modify-write, serialised per key by the lock provider. O(size) per
   * append, fine for per-session logs; cross-isolate safety needs the Durable Object lock.
   * Scale-up path: segment the log (`<name>/000001.ndjson`, …) and append by writing new segments.
   */
  append(p: string, text: string): Promise<void> {
    const key = toKey(p);
    return withLock(`r2-append:${key}`, async () => {
      const obj = await this.bucket.get(key);
      const before = obj ? await obj.text() : "";
      await this.bucket.put(key, before + text);
    });
  }

  private async *listAll(prefix: string, delimiter?: string) {
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, delimiter, cursor });
      yield page;
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }

  async list(dir: string): Promise<BlobDirEntry[]> {
    const prefix = `${toKey(dir)}/`;
    const out: BlobDirEntry[] = [];
    for await (const page of this.listAll(prefix, "/")) {
      for (const o of page.objects) out.push({ name: o.key.slice(prefix.length), isDir: false });
      for (const d of page.delimitedPrefixes) out.push({ name: d.slice(prefix.length).replace(/\/$/, ""), isDir: true });
    }
    return out;
  }

  async stat(p: string): Promise<BlobStat | null> {
    let key: string;
    try {
      key = toKey(p);
    } catch {
      return null;
    }
    const head = await this.bucket.head(key);
    if (head) return { kind: "file", size: head.size };
    const page = await this.bucket.list({ prefix: `${key}/`, limit: 1 });
    return page.objects.length ? { kind: "dir", size: 0 } : null;
  }

  async delete(p: string): Promise<void> {
    await this.bucket.delete(toKey(p));
  }

  async deleteTree(p: string): Promise<void> {
    const key = toKey(p);
    await this.bucket.delete(key);
    for await (const page of this.listAll(`${key}/`)) {
      if (page.objects.length) await this.bucket.delete(page.objects.map((o) => o.key));
    }
  }

  /** No symlinks in R2: the canonical location is the resolved path, if it maps to a key and exists. */
  async realpath(p: string): Promise<string | null> {
    return (await this.stat(p)) ? path.resolve(p) : null;
  }

  async checkWritable(dir: string): Promise<boolean> {
    try {
      const probe = `${toKey(dir)}/.write-probe`;
      await this.bucket.put(probe, "");
      await this.bucket.delete(probe);
      return true;
    } catch {
      return false;
    }
  }
}

// --- selection -----------------------------------------------------------------------

const g = globalThis as typeof globalThis & { __ws6BlobStore?: BlobStore; __ws6R2Bucket?: R2BucketLike };

/** Called by the Workers entry point with `env.<binding>` before the first request is served. */
export function setR2Bucket(bucket: R2BucketLike): void {
  g.__ws6R2Bucket = bucket;
  g.__ws6BlobStore = undefined;
}

export function getBlobStore(): BlobStore {
  if (g.__ws6BlobStore) return g.__ws6BlobStore;
  const backend = process.env.STORAGE_BACKEND?.trim() || "fs";
  if (backend === "fs") return (g.__ws6BlobStore = new FsBlobStore());
  if (backend === "r2") {
    if (!g.__ws6R2Bucket) throw new Error("STORAGE_BACKEND=r2 but no R2 bucket binding was set (setR2Bucket).");
    return (g.__ws6BlobStore = new R2BlobStore(g.__ws6R2Bucket));
  }
  throw new Error(`Unknown STORAGE_BACKEND ${JSON.stringify(backend)} (expected fs or r2).`);
}

/** Tests: force a store (or undefined to re-select from env). */
export function setBlobStoreForTests(store: BlobStore | undefined): void {
  g.__ws6BlobStore = store;
}

/** Names of the immediate children of `dir` ([] when it does not exist). */
export async function listNames(dir: string): Promise<string[]> {
  return (await getBlobStore().list(dir)).map((e) => e.name);
}
