// Imported as the `promises` object (not the fs/promises namespace) so tests can vi.spyOn it.
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { z } from "zod";
import { ApiError } from "./errors";
import { withLock } from "./locks";

export type PutResult<T> = { status: 200 | 201; record: T };

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code;
}

/** Temp file in the same directory + fsync + rename, so readers never see a partial file. */
export async function writeFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
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

export function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  return writeFileAtomic(target, JSON.stringify(value, null, 2) + "\n");
}

async function readJsonRaw(target: string): Promise<unknown | null> {
  let text: string;
  try {
    text = await fs.readFile(target, "utf8");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return null;
    throw err;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Never include file content in the error.
    throw new ApiError("validation_failed", "Stored file is not valid JSON.", {
      file: path.basename(target),
    });
  }
}

export async function readJson<T>(target: string, schema: z.ZodType<T>): Promise<T | null> {
  const raw = await readJsonRaw(target);
  if (raw === null) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("validation_failed", "Stored file does not match its schema.", {
      file: path.basename(target),
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) out[key] = sortKeys((v as Record<string, unknown>)[key]);
    return out;
  }
  return v;
}

/** JSON with object keys sorted recursively; used for idempotency equality. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function readStored<T>(target: string, schema?: z.ZodType<T>): Promise<T | null> {
  return schema ? readJson(target, schema) : (readJsonRaw(target) as Promise<T | null>);
}

export function putImmutable<T>(
  target: string,
  record: T,
  schema?: z.ZodType<T>,
): Promise<PutResult<T>> {
  return withLock(target, async () => {
    const stored = await readStored(target, schema);
    if (stored === null) {
      await writeJsonAtomic(target, record);
      return { status: 201, record };
    }
    if (canonicalJson(stored) === canonicalJson(record)) return { status: 200, record: stored };
    throw new ApiError("conflict_immutable", "A different record already exists with this ID.");
  });
}

type MutableOptions<T> = { revOf?: (record: T) => number; schema?: z.ZodType<T> };

export function putMutable<T extends { rev: number }>(
  target: string,
  record: T,
  opts?: { schema?: z.ZodType<T> },
): Promise<PutResult<T>>;
export function putMutable<T>(
  target: string,
  record: T,
  opts: { revOf: (record: T) => number; schema?: z.ZodType<T> },
): Promise<PutResult<T>>;
export function putMutable<T>(
  target: string,
  record: T,
  opts: MutableOptions<T> = {},
): Promise<PutResult<T>> {
  const revOf = opts.revOf ?? ((r: T) => (r as { rev: number }).rev);
  return withLock(target, async () => {
    const stored = await readStored(target, opts.schema);
    if (stored === null) {
      await writeJsonAtomic(target, record);
      return { status: 201, record };
    }
    const storedRev = revOf(stored);
    const receivedRev = revOf(record);
    if (receivedRev > storedRev) {
      await writeJsonAtomic(target, record);
      return { status: 200, record };
    }
    if (receivedRev === storedRev && canonicalJson(stored) === canonicalJson(record)) {
      return { status: 200, record: stored };
    }
    throw new ApiError("stale_revision", "Revision must be higher than the stored revision.", {
      stored_rev: storedRev,
      received_rev: receivedRev,
    });
  });
}
