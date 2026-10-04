/**
 * Server-sent events for one session's bus (research R10).
 *
 * Ordering guarantee: subscribe first (buffering live events), then replay the persisted log
 * after `after`, then flush the buffer and continue live. Every write goes through one serial
 * queue and only events with `seq > lastSent` are sent, so a client sees no duplicates. If a
 * live event arrives with a gap (`seq > lastSent + 1`, e.g. two concurrent publishes overtook
 * each other), the gap is filled from the log — events are persisted before they are published.
 */
import type { BusEvent } from "@/lib/contracts";
import { readBusAfter, subscribe } from "./bus";
import { diag } from "./diag";

export type SessionStreamOptions = {
  /** Last seq the client has; `null` = start live (no replay). */
  after: number | null;
  signal?: AbortSignal;
  heartbeatMs?: number;
};

const encoder = new TextEncoder();
const pendingCloseLogs = new Set<Promise<unknown>>();

/** Resolves when every stream-close diag line has been written (tests await it before cleanup). */
export async function flushStreamLogs(): Promise<void> {
  await Promise.all([...pendingCloseLogs]);
}
const DEFAULT_HEARTBEAT_MS = 15_000;

export function formatSseMessage(event: BusEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function sessionStream(sid: string, opts: SessionStreamOptions): ReadableStream<Uint8Array> {
  const openedAt = performance.now();
  let closed = false;
  let cleanup: (closeController: boolean) => void = () => undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(false);
        }
      };

      /** `null` until the first event is sent on a live-only stream. */
      let lastSent: number | null = opts.after;
      let replaying = true;
      const buffered: BusEvent[] = [];

      const send = (event: BusEvent): void => {
        if (lastSent !== null && event.seq <= lastSent) return;
        write(formatSseMessage(event));
        lastSent = event.seq;
      };

      // Serial queue: replay, buffer flush and live deliveries never interleave.
      let queue: Promise<void> = Promise.resolve();
      const enqueueTask = (task: () => Promise<void> | void): void => {
        queue = queue
          .then(async () => {
            if (!closed) await task();
          })
          .catch(() => cleanup(true));
      };

      const deliverLive = async (event: BusEvent): Promise<void> => {
        if (lastSent !== null && event.seq > lastSent + 1) {
          for (const missed of await readBusAfter(sid, lastSent)) {
            if (missed.seq >= event.seq) break;
            send(missed);
          }
        }
        send(event);
      };

      const unsubscribe = subscribe(sid, (event) => {
        if (closed) return;
        if (replaying) buffered.push(event);
        else enqueueTask(() => deliverLive(event));
      });

      const heartbeat = setInterval(() => write(": hb\n\n"), opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);

      const onAbort = (): void => cleanup(true);
      cleanup = (closeController: boolean): void => {
        if (closed) return;
        closed = true;
        // Lets diagnostics show when a client went away (a killed tab, a dropped LAN connection).
        const log = diag({ component: "stream", op: "close", ids: { session_id: sid }, outcome: "ok", duration_ms: performance.now() - openedAt });
        pendingCloseLogs.add(log);
        void log.finally(() => pendingCloseLogs.delete(log));
        unsubscribe();
        clearInterval(heartbeat);
        opts.signal?.removeEventListener("abort", onAbort);
        if (closeController) {
          try {
            controller.close();
          } catch {
            // Already closed or cancelled.
          }
        }
      };

      if (opts.signal?.aborted) {
        cleanup(true);
        return;
      }
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      enqueueTask(async () => {
        if (opts.after !== null) {
          for (const event of await readBusAfter(sid, opts.after)) send(event);
        }
        replaying = false;
        const pending = buffered.splice(0).sort((a, b) => a.seq - b.seq);
        for (const event of pending) await deliverLive(event);
      });
    },
    cancel() {
      cleanup(false);
    },
  });
}

const NON_NEGATIVE_INT = /^(0|[1-9][0-9]{0,15})$/;

function toSeq(value: string): number | null {
  if (!NON_NEGATIVE_INT.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Reconnect position: a non-empty `Last-Event-ID` header wins over `?after=`. Each must be a
 * non-negative integer string; anything else → `null` (start live).
 */
export function parseAfter(request: Request): number | null {
  const header = request.headers.get("last-event-id");
  if (header !== null && header !== "") return toSeq(header);
  const query = new URL(request.url).searchParams.get("after");
  return query === null ? null : toSeq(query);
}
