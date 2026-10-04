/**
 * ID and idempotency rules for the WS6 backend.
 *
 * - Producers own their IDs and write by ID (PUT /…/:id).
 * - Same body again → 200 with the stored record (key order is irrelevant).
 * - Different body for an immutable record → 409 `conflict_immutable`.
 * - Mutable records accept only a higher rev; equal rev + identical body is an
 *   idempotent retry → 200; anything else → 409 `stale_revision`.
 * - Server-generated IDs use the prefixes in `IdPrefix` via `newId`.
 * - Every ID that becomes a path segment must match `ID_RE`.
 */
import { randomInt } from "node:crypto";
import path from "node:path";
import { ApiError } from "./errors";

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type IdPrefix = "ses" | "cnf" | "evl" | "cmt" | "rev" | "seg" | "job" | "mrk";

export function isValidId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

export function assertSafeId(v: unknown, field = "id"): asserts v is string {
  if (!isValidId(v)) {
    throw new ApiError("validation_failed", `Invalid ${field}.`, { field });
  }
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(prefix: IdPrefix, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += BASE36[randomInt(BASE36.length)];
  return `${prefix}-${stamp}-${suffix}`;
}

/** Joins ID segments under `base`. Callers append filenames with path.join. */
export function safeJoin(base: string, ...segments: string[]): string {
  segments.forEach((s, i) => assertSafeId(s, `path segment ${i}`));
  const root = path.resolve(base);
  const joined = path.resolve(root, ...segments);
  if (joined !== root && !joined.startsWith(root + path.sep)) {
    throw new ApiError("validation_failed", "Path escapes its base directory.");
  }
  return joined;
}
