/**
 * Session storage and guards. All session-changing operations and all content writes for a
 * session run under `withSessionLock(sid)`, so an off-record toggle can never race a write.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  SessionSchema,
  type CreateSessionRequest,
  type LifecycleRequest,
  type RecordState,
  type RecordStateRequest,
  type Session,
} from "@/lib/contracts";
import { appendBus } from "./bus";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { assertSafeId, newId } from "./ids";
import { withLock } from "./locks";
import { sessionFile } from "./paths";
import { applyLifecycle, applyRecordState } from "./session-lifecycle";
import { putMutable, readJson, writeJsonAtomic } from "./store";
import { assertSessionNotDeleted } from "./tombstones";

export function withSessionLock<T>(sid: string, fn: () => Promise<T>): Promise<T> {
  return withLock(`sess:${sid}`, fn);
}

export async function loadSession(sid: string): Promise<Session | null> {
  assertSafeId(sid, "session_id");
  return readJson(sessionFile(sid), SessionSchema);
}

export async function getSession(sid: string): Promise<Session> {
  const session = await loadSession(sid);
  if (!session) {
    await assertSessionNotDeleted(sid);
    throw new ApiError("not_found", "Session not found.", { session_id: sid });
  }
  return session;
}

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,200}$/;
const IdempotencyRecord = z.object({ session_id: z.string() });

function idempotencyFile(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return path.join(getConfig().runtimeDir, "idempotency", "sessions", `${hash}.json`);
}

/** Newcomer-only fields computed at creation (case + pinned knowledge); see `newcomer.ts`. */
export type SessionInit = Pick<Session, "case_id" | "trace_ref" | "pinned_knowledge"> & { knowledge_fixture_allowed?: boolean };
export type PrepareSession = () => Promise<SessionInit>;

async function writeNewSession(req: CreateSessionRequest, now: Date, prepare?: PrepareSession): Promise<Session> {
  const at = now.toISOString();
  let init: SessionInit;
  if (req.role === "expert") init = { case_id: null, trace_ref: req.trace_ref, pinned_knowledge: null };
  else if (prepare) init = await prepare();
  else throw new Error("newcomer sessions are created through createNewcomerSession");
  const session: Session = {
    session_id: newId("ses", now),
    role: req.role,
    lifecycle: "created",
    record_state: "on_record",
    recording_segments: [{ segment_id: newId("seg", now), state: "on_record", started_at_utc: at, ended_at_utc: null }],
    ...init,
    source: req.source,
    created_at_utc: at,
    rev: 1,
  };
  await putMutable(sessionFile(session.session_id), session, { schema: SessionSchema });
  return session;
}

/** Same `Idempotency-Key` → the same session (`200`); the key maps to the session in RUNTIME_DIR. */
export async function createSession(
  req: CreateSessionRequest,
  idempotencyKey?: string | null,
  now: Date = new Date(),
  prepare?: PrepareSession,
): Promise<{ status: 200 | 201; session: Session }> {
  if (idempotencyKey === undefined || idempotencyKey === null) {
    return { status: 201, session: await writeNewSession(req, now, prepare) };
  }
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    throw new ApiError("validation_failed", "Idempotency-Key must be 1–200 printable ASCII characters.");
  }
  const file = idempotencyFile(idempotencyKey);
  return withLock(`idem:${file}`, async () => {
    const existing = await readJson(file, IdempotencyRecord);
    if (existing) return { status: 200 as const, session: await getSession(existing.session_id) };
    // A replayed key never re-runs `prepare`, so a knowledge change cannot fail a retry.
    const session = await writeNewSession(req, now, prepare);
    await writeJsonAtomic(file, { session_id: session.session_id });
    return { status: 201 as const, session };
  });
}

export async function changeLifecycle(sid: string, req: LifecycleRequest, now: Date = new Date()): Promise<Session> {
  assertSafeId(sid, "session_id");
  return withSessionLock(sid, async () => {
    const applied = applyLifecycle(await getSession(sid), req, now);
    if (!applied.changed) return applied.session;
    await putMutable(sessionFile(sid), applied.session, { schema: SessionSchema });
    await appendBus(sid, "session.updated", { session_id: sid }, now);
    return applied.session;
  });
}

export async function changeRecordState(sid: string, req: RecordStateRequest, now: Date = new Date()): Promise<Session> {
  assertSafeId(sid, "session_id");
  return withSessionLock(sid, async () => {
    const segmentId = newId("seg", now);
    const applied = applyRecordState(await getSession(sid), req.state, now, segmentId, req.since_utc);
    if (!applied.changed) return applied.session;
    await putMutable(sessionFile(sid), applied.session, { schema: SessionSchema });
    await appendBus(sid, "record_state.changed", { segment_id: segmentId }, now);
    return applied.session;
  });
}

/** Bumps the session's generation (S4 cascades/purges); jobs that read an older one are discarded. Call inside the session lock. */
export async function bumpGenerationLocked(sid: string, now: Date = new Date()): Promise<Session | null> {
  const session = await loadSession(sid);
  if (!session) return null;
  const next: Session = { ...session, generation: (session.generation ?? 0) + 1, rev: session.rev + 1 };
  await putMutable(sessionFile(sid), next, { schema: SessionSchema });
  await appendBus(sid, "session.updated", { session_id: sid }, now);
  return next;
}

/**
 * Guard for content writes (assets, events, exchanges). Call inside `withSessionLock(sid)`.
 * Ended sessions still accept late deliveries; aborted ones do not. Off-record — either the
 * session's acknowledged state or the record's own label — means nothing is stored.
 */
export async function requireWritableSession(sid: string, recordState?: RecordState): Promise<Session> {
  const session = await getSession(sid);
  if (session.lifecycle === "aborted") {
    throw new ApiError("invalid_transition", "Session is aborted.", { lifecycle: session.lifecycle });
  }
  if (session.record_state === "off_record" || recordState === "off_record") {
    throw new ApiError("off_record", "Session is off the record; nothing was stored.");
  }
  return session;
}

/** Content writes need a session that is not aborted; off-record is decided per record (S4). */
export async function requireLiveSession(sid: string): Promise<Session> {
  const session = await getSession(sid);
  if (session.lifecycle === "aborted") {
    throw new ApiError("invalid_transition", "Session is aborted.", { lifecycle: session.lifecycle });
  }
  return session;
}

/** Voice access is only issued for active sessions. */
export async function requireActiveSession(sid: string): Promise<Session> {
  const session = await getSession(sid);
  if (session.lifecycle !== "active") {
    throw new ApiError("invalid_transition", "Session is not active.", { lifecycle: session.lifecycle });
  }
  return session;
}
