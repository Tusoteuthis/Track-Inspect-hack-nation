/**
 * Per-session live-update bus: append-only `bus.ndjson` with a monotonic seq, plus in-memory
 * subscribers. Every event is appended to the log first and published second, so a client that
 * reconnects with its last seq can replay exactly what it missed.
 *
 * Single-process assumption (constitution W8): subscribers and the seq cache live in this
 * process. They hang off globalThis so Next dev module reloads keep one shared bus.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { BusEventSchema, type BusEvent } from "@/lib/contracts";
import { ApiError } from "./errors";
import { withLock } from "./locks";
import { sessionDir } from "./paths";

export type BusListener = (event: BusEvent) => void | Promise<void>;

type BusState = { subscribers: Map<string, Set<BusListener>>; lastSeq: Map<string, number> };

const globalBus = globalThis as typeof globalThis & { __ws6Bus?: BusState };
const state: BusState = (globalBus.__ws6Bus ??= { subscribers: new Map(), lastSeq: new Map() });

export function busFile(sid: string): string {
  return path.join(sessionDir(sid), "bus.ndjson");
}

async function readAll(file: string): Promise<BusEvent[]> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const events: BusEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = BusEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // A torn final line (crash mid-append) is skipped.
    }
  }
  return events;
}

export async function appendBus(
  sid: string,
  type: string,
  ids: BusEvent["ids"],
  now: Date = new Date(),
): Promise<BusEvent> {
  const file = busFile(sid);
  const event = await withLock(`bus:${file}`, async () => {
    let last = state.lastSeq.get(file);
    if (last === undefined) {
      const existing = await readAll(file);
      last = existing.length ? existing[existing.length - 1].seq : 0;
    }
    const parsed = BusEventSchema.safeParse({ seq: last + 1, type, session_id: sid, ids, at_utc: now.toISOString() });
    if (!parsed.success) throw new ApiError("validation_failed", "Bus events carry IDs only.");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify(parsed.data) + "\n");
    state.lastSeq.set(file, parsed.data.seq);
    return parsed.data;
  });
  publish(file, event);
  return event;
}

function publish(file: string, event: BusEvent): void {
  for (const listener of state.subscribers.get(file) ?? []) {
    try {
      void Promise.resolve(listener(event)).catch(() => undefined);
    } catch {
      // One broken subscriber must not affect the writer or other subscribers.
    }
  }
}

/** Persisted events with `seq > after`, in seq order. */
export async function readBusAfter(sid: string, after: number): Promise<BusEvent[]> {
  return (await readAll(busFile(sid))).filter((e) => e.seq > after);
}

export async function findBusSeq(sid: string, match: (event: BusEvent) => boolean): Promise<number | null> {
  return (await readAll(busFile(sid))).find(match)?.seq ?? null;
}

export function subscribe(sid: string, listener: BusListener): () => void {
  const file = busFile(sid);
  let set = state.subscribers.get(file);
  if (!set) state.subscribers.set(file, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0 && state.subscribers.get(file) === set) state.subscribers.delete(file);
  };
}
