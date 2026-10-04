/**
 * Pointing events: immutable, idempotent by `event_id`, accepted only once their evidence asset
 * is stored for the same session. The ack `seq` is the seq of the event's `event.stored` bus
 * entry, looked up on retries, so a client that lost the first response gets the same ack.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  PointingEventIngestSchema,
  parsePointingEventIngest,
  type DroppedOffRecord,
  type EventAck,
  type PointingEventIngest,
} from "@/lib/contracts";
import { appendBus, findBusSeq, readBusAfter } from "./bus";
import { loadAssetMeta } from "./assets";
import { ApiError } from "./errors";
import { assertSafeId } from "./ids";
import { sessionDir, sessionRecordFile } from "./paths";
import { isOffRecordWrite } from "./off-record";
import { getSession, requireLiveSession, withSessionLock } from "./sessions";
import { droppedAnswer, droppedTombstone, tombstoneAnswer, writeTombstone } from "./tombstones";
import { canonicalJson, putImmutable, readJson } from "./store";

export type StoredEvent = PointingEventIngest & { asset_id: string };

function parseEventBody(sid: string, eid: string, body: unknown): StoredEvent {
  const parsed = parsePointingEventIngest(body);
  if (!parsed.ok) throw new ApiError("validation_failed", parsed.error.message, { issues: parsed.error.issues });
  const event = parsed.value;
  if (event.session_id !== sid) throw new ApiError("validation_failed", "session_id must match the path.", { field: "session_id" });
  if (event.event_id !== eid) throw new ApiError("validation_failed", "event_id must match the path.", { field: "event_id" });
  if (event.asset_id === undefined) {
    throw new ApiError("validation_failed", "asset_id is required; upload the asset first.", { field: "asset_id" });
  }
  const aid = event.asset_id;
  // Clients may send any placeholder refs; the stored event always points at the served asset.
  return {
    ...event,
    asset_id: aid,
    image_ref: `/api/assets/${aid}/original`,
    highlighted_image_ref: `/api/assets/${aid}/highlighted`,
  };
}

async function requireAvailableAsset(sid: string, aid: string): Promise<void> {
  const asset = await loadAssetMeta(aid);
  if (!asset || asset.status !== "stored" || asset.session_id !== sid) {
    throw new ApiError("asset_not_available", "Referenced asset is not stored for this session.", { asset_id: aid });
  }
  if (asset.highlighted === null) {
    throw new ApiError("asset_not_available", "Referenced asset has no highlighted image.", {
      asset_id: aid,
      missing: "highlighted",
    });
  }
}

async function ackSeq(sid: string, event: StoredEvent): Promise<number> {
  const seq = await findBusSeq(sid, (e) => e.type === "event.stored" && e.ids.event_id === event.event_id);
  if (seq !== null) return seq;
  // Stored but never announced (crash between write and publish): announce it now.
  return (await appendBus(sid, "event.stored", { event_id: event.event_id, asset_id: event.asset_id })).seq;
}

export type PutEventResult =
  | { status: 200 | 201; ack: EventAck; dropped?: undefined }
  | { status: 202; dropped: DroppedOffRecord; ack?: undefined };

export async function putEvent(sid: string, eid: string, body: unknown): Promise<PutEventResult> {
  assertSafeId(sid, "session_id");
  assertSafeId(eid, "event_id");
  const event = parseEventBody(sid, eid, body);
  const file = sessionRecordFile(sid, "events", eid);
  return withSessionLock(sid, async (): Promise<PutEventResult> => {
    const stored = await readJson(file, PointingEventIngestSchema);
    if (stored !== null && canonicalJson(stored) === canonicalJson(event)) {
      // An identical retry stores nothing, so it is answered even if the session went off-record since.
      return { status: 200 as const, ack: { event_id: eid, status: "stored" as const, seq: await ackSeq(sid, event) } };
    }
    if (stored !== null) throw new ApiError("conflict_immutable", "A different event already exists with this ID.");
    const tomb = await tombstoneAnswer("event", eid, sid);
    if (tomb) return { status: 202, dropped: tomb };
    const session = await requireLiveSession(sid);
    if (isOffRecordWrite(session, event.record_state, event.captured_at_utc)) {
      await writeTombstone(droppedTombstone("event", eid, sid, new Date()));
      return { status: 202, dropped: droppedAnswer("event", eid) };
    }
    await requireAvailableAsset(sid, event.asset_id);
    const result = await putImmutable(file, event, PointingEventIngestSchema);
    const seq = (await appendBus(sid, "event.stored", { event_id: eid, asset_id: event.asset_id })).seq;
    return { status: result.status, ack: { event_id: eid, status: "stored" as const, seq } };
  });
}

export async function getEvent(sid: string, eid: string): Promise<PointingEventIngest> {
  await getSession(sid);
  assertSafeId(eid, "event_id");
  const event = await readJson(sessionRecordFile(sid, "events", eid), PointingEventIngestSchema);
  if (!event) throw new ApiError("not_found", "Event not found.", { event_id: eid });
  return event;
}

export async function eventExists(sid: string, eid: string): Promise<boolean> {
  return (await readJson(sessionRecordFile(sid, "events", eid), PointingEventIngestSchema)) !== null;
}

async function listIds(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".json") && !f.startsWith(".")).map((f) => f.slice(0, -5));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Ordered by `captured_at_utc`, then arrival (the seq of `event.stored`). */
export async function listEvents(sid: string): Promise<PointingEventIngest[]> {
  await getSession(sid);
  const arrival = new Map<string, number>();
  for (const e of await readBusAfter(sid, 0)) {
    const eid = e.ids.event_id;
    if (e.type === "event.stored" && typeof eid === "string" && !arrival.has(eid)) arrival.set(eid, e.seq);
  }
  const events = await Promise.all(
    (await listIds(path.join(sessionDir(sid), "events"))).map((eid) => getEvent(sid, eid)),
  );
  const seqOf = (e: PointingEventIngest) => arrival.get(e.event_id) ?? Number.MAX_SAFE_INTEGER;
  return events.sort(
    (a, b) =>
      Date.parse(a.captured_at_utc) - Date.parse(b.captured_at_utc) ||
      seqOf(a) - seqOf(b) ||
      a.event_id.localeCompare(b.event_id),
  );
}

export { listIds as listRecordIds };
