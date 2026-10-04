/**
 * Expert exchanges: mutable by `rev` (answer lines grow), but `event_id` is fixed by the first
 * write. This is how a delayed answer keeps its original event: no later write can re-attach it.
 */
import path from "node:path";
import { ExchangePutSchema, parseExchangePut, type DroppedOffRecord, type ExchangePut } from "@/lib/contracts";
import { appendBus } from "./bus";
import { ApiError } from "./errors";
import { eventExists, listRecordIds } from "./events";
import { assertSafeId } from "./ids";
import { sessionDir, sessionRecordFile } from "./paths";
import { isOffRecordWrite, onRecordLines } from "./off-record";
import { getSession, requireLiveSession, withSessionLock } from "./sessions";
import { droppedAnswer, droppedTombstone, tombstoneAnswer, writeTombstone } from "./tombstones";
import { canonicalJson, putMutable, readJson } from "./store";

function parseExchangeBody(sid: string, xid: string, body: unknown): ExchangePut {
  const parsed = parseExchangePut(body);
  if (!parsed.ok) throw new ApiError("validation_failed", parsed.error.message, { issues: parsed.error.issues });
  const exchange = parsed.value;
  if (exchange.session_id !== sid) {
    throw new ApiError("validation_failed", "session_id must match the path.", { field: "session_id" });
  }
  if (exchange.exchange_id !== xid) {
    throw new ApiError("validation_failed", "exchange_id must match the path.", { field: "exchange_id" });
  }
  return exchange;
}

export type PutExchangeResult =
  | { status: 200 | 201; exchange: ExchangePut; dropped?: undefined }
  | { status: 202; dropped: DroppedOffRecord; exchange?: undefined };

export async function putExchange(sid: string, xid: string, body: unknown): Promise<PutExchangeResult> {
  assertSafeId(sid, "session_id");
  assertSafeId(xid, "exchange_id");
  const received = parseExchangeBody(sid, xid, body);
  const file = sessionRecordFile(sid, "exchanges", xid);
  return withSessionLock(sid, async (): Promise<PutExchangeResult> => {
    const session = await getSession(sid);
    // Lines spoken inside an off-record segment are never stored, also not on retries.
    const exchange: ExchangePut = { ...received, answer_lines: onRecordLines(session, received.answer_lines) };
    const stored = await readJson(file, ExchangePutSchema);
    if (stored !== null && canonicalJson(stored) === canonicalJson(exchange)) {
      return { status: 200 as const, exchange: stored };
    }
    const tomb = await tombstoneAnswer("exchange", xid, sid);
    if (tomb) return { status: 202, dropped: tomb };
    await requireLiveSession(sid);
    if (exchange.record_state === "off_record") return { status: 202, dropped: droppedAnswer("exchange", xid) };
    if (stored === null && isOffRecordWrite(session, exchange.record_state, exchange.asked_at_utc)) {
      await writeTombstone(droppedTombstone("exchange", xid, sid, new Date()));
      return { status: 202, dropped: droppedAnswer("exchange", xid) };
    }
    if (stored !== null && stored.event_id !== exchange.event_id) {
      throw new ApiError("conflict_immutable", "event_id cannot change after the first write.", { field: "event_id" });
    }
    if (stored !== null && exchange.rev <= stored.rev) {
      throw new ApiError("stale_revision", "Exchange revision is not newer than the stored one.", {
        current_rev: stored.rev,
        received_rev: exchange.rev,
      });
    }
    if (exchange.event_id !== null && !(await eventExists(sid, exchange.event_id))) {
      throw new ApiError("not_found", "Referenced event is not stored for this session.", {
        missing: "event",
        event_id: exchange.event_id,
      });
    }
    const result = await putMutable(file, exchange, { schema: ExchangePutSchema });
    const ids: Record<string, string> = { exchange_id: xid };
    if (exchange.event_id !== null) ids.event_id = exchange.event_id;
    await appendBus(sid, "exchange.updated", ids);
    return { status: result.status, exchange: result.record };
  });
}

export async function getExchange(sid: string, xid: string): Promise<ExchangePut> {
  await getSession(sid);
  assertSafeId(xid, "exchange_id");
  const exchange = await readJson(sessionRecordFile(sid, "exchanges", xid), ExchangePutSchema);
  if (!exchange) throw new ApiError("not_found", "Exchange not found.", { exchange_id: xid });
  return exchange;
}

export async function listExchanges(sid: string): Promise<ExchangePut[]> {
  await getSession(sid);
  const ids = await listRecordIds(path.join(sessionDir(sid), "exchanges"));
  const exchanges = await Promise.all(ids.map((xid) => getExchange(sid, xid)));
  return exchanges.sort(
    (a, b) => Date.parse(a.asked_at_utc) - Date.parse(b.asked_at_utc) || a.exchange_id.localeCompare(b.exchange_id),
  );
}
