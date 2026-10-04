import path from "node:path";
import type { z } from "zod";
import { getBlobStore } from "./blobstore";
import { ApiError } from "./errors";
import { withLock } from "./locks";

export type PutResult<T> = { status: 200 | 201; record: T };

/** Temp file in the same directory + fsync + rename (fs), or one object put (r2): readers never see a partial file. */
export function writeFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  return getBlobStore().put(target, data);
}

export function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  return writeFileAtomic(target, JSON.stringify(value, null, 2) + "\n");
}

async function readJsonRaw(target: string): Promise<unknown | null> {
  const text = await getBlobStore().getText(target);
  if (text === null) return null;
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
