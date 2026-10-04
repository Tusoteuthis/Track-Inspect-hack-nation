/**
 * Diagnostics log: IDs, timings and outcomes only, never content (constitution W4).
 * Lines are rebuilt from an allow-list, so a caller passing extra fields (question text,
 * answer lines, image bytes…) cannot leak them. Writing never throws.
 */
import path from "node:path";
import { ErrorCodeSchema, type ErrorCode } from "@/lib/contracts";
import { getConfig } from "./config";
import { isValidId } from "./ids";
import { getBlobStore } from "./blobstore";

export type DiagOutcome = "ok" | "error";

export type DiagInput = {
  component: string;
  op: string;
  ids: Record<string, string>;
  outcome: DiagOutcome;
  duration_ms: number;
  error_code?: ErrorCode;
};

export type DiagLine = {
  at_utc: string;
  component?: string;
  op?: string;
  ids: Record<string, string>;
  outcome?: DiagOutcome;
  duration_ms?: number;
  error_code?: ErrorCode;
};

const SLUG_RE = /^[a-z][a-z0-9_.-]{0,63}$/;
const isSlug = (v: unknown): v is string => typeof v === "string" && SLUG_RE.test(v);

export function sanitizeDiag(input: DiagInput, now: Date = new Date()): DiagLine {
  const line: DiagLine = { at_utc: now.toISOString(), ids: {} };
  if (isSlug(input.component)) line.component = input.component;
  if (isSlug(input.op)) line.op = input.op;
  if (input.ids !== null && typeof input.ids === "object") {
    for (const [key, value] of Object.entries(input.ids)) {
      if (isSlug(key) && isValidId(value)) line.ids[key] = value;
    }
  }
  if (input.outcome === "ok" || input.outcome === "error") line.outcome = input.outcome;
  if (typeof input.duration_ms === "number" && Number.isFinite(input.duration_ms) && input.duration_ms >= 0) {
    line.duration_ms = Math.round(input.duration_ms * 10) / 10;
  }
  if (ErrorCodeSchema.safeParse(input.error_code).success) line.error_code = input.error_code;
  return line;
}

export async function diag(input: DiagInput, now: Date = new Date()): Promise<DiagLine> {
  const line = sanitizeDiag(input, now);
  try {
    const dir = path.join(getConfig().runtimeDir, "diag");
    await getBlobStore().append(path.join(dir, `${line.at_utc.slice(0, 10)}.ndjson`), JSON.stringify(line) + "\n");
  } catch {
    // Diagnostics must never break a request.
  }
  return line;
}
