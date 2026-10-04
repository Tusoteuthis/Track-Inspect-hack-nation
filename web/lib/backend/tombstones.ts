/**
 * Tombstones (S4): `knowledge/tombstones/{assets/<aid>, sessions/<sid>, sessions/<sid>/<kind>s/<id>}.json`.
 * Content-free records of what was dropped off the record or deleted, so a late retry can neither
 * recreate it nor fail confusingly: dropped → `202 dropped_off_record` again, deleted → `410 gone`.
 * Kept outside `knowledge/sessions/` so deleting a session keeps its children's tombstones.
 */
import path from "node:path";
import { TombstoneSchema, type DroppedOffRecord, type Tombstone, type TombstoneKind } from "@/lib/contracts";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { safeJoin } from "./ids";
import { readJson, writeJsonAtomic } from "./store";

const root = () => path.join(getConfig().knowledgeDir, "tombstones");

export function tombstoneFile(kind: TombstoneKind, id: string, sessionId: string | null): string {
  if (kind === "asset") return safeJoin(path.join(root(), "assets"), id) + ".json";
  if (kind === "session") return safeJoin(path.join(root(), "sessions"), id) + ".json";
  if (!sessionId) throw new Error(`${kind} tombstones need a session`);
  return safeJoin(path.join(root(), "sessions"), sessionId, `${kind}s`, id) + ".json";
}

export function readTombstone(kind: TombstoneKind, id: string, sessionId: string | null): Promise<Tombstone | null> {
  return readJson(tombstoneFile(kind, id, sessionId), TombstoneSchema).catch(() => null);
}

/** Writes a tombstone unless one exists (a deletion never turns back into a drop). */
export async function writeTombstone(t: Tombstone): Promise<Tombstone> {
  const existing = await readTombstone(t.kind, t.id, t.session_id);
  if (existing && (!existing.dropped || t.dropped)) return existing;
  await writeJsonAtomic(tombstoneFile(t.kind, t.id, t.session_id), TombstoneSchema.parse(t));
  return t;
}

export function droppedTombstone(kind: Exclude<TombstoneKind, "session">, id: string, sessionId: string, now: Date, reason = "off_record"): Tombstone {
  return { kind, id, session_id: sessionId, record_state: "off_record", dropped: true, deleted_at_utc: now.toISOString(), reason };
}

export const droppedAnswer = (kind: DroppedOffRecord["kind"], id: string): DroppedOffRecord => ({ status: "dropped_off_record", kind, id });

/**
 * For writes by ID: null if no tombstone; the `202` answer if it was dropped off the record;
 * throws `410 gone` if it was deleted.
 */
export async function tombstoneAnswer(kind: DroppedOffRecord["kind"], id: string, sessionId: string): Promise<DroppedOffRecord | null> {
  const t = await readTombstone(kind, id, kind === "asset" ? null : sessionId);
  if (!t) return null;
  if (t.dropped) return droppedAnswer(kind, id);
  throw new ApiError("gone", `This ${kind} was deleted; its ID cannot be reused.`, { [`${kind}_id`]: id, deleted_at_utc: t.deleted_at_utc });
}

export async function assertSessionNotDeleted(sid: string): Promise<void> {
  const t = await readTombstone("session", sid, null);
  if (t) throw new ApiError("gone", "This session was deleted.", { session_id: sid, deleted_at_utc: t.deleted_at_utc });
}
