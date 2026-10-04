/**
 * SKETCH — not wired, not imported by the app. Durable Object replacements for the in-process state
 * (locks.ts, synthesis JobTracker, bus.ts subscribers) when the backend runs on plain Workers.
 * See notes/deploy/storage-port-status.md for the plan. Types are local so this compiles without
 * @cloudflare/workers-types; swap them for the real ones when the Workers entry point exists.
 *
 * Two pieces:
 *  1. `LockDurableObject` + `DurableLockProvider`: a lease lock per key. Any isolate calls
 *     `withLock(key, fn)`; the DO named `key` grants one lease at a time, queues the rest, and an
 *     alarm frees a lease whose holder died (TTL). Correct across isolates, costs 2 DO round-trips
 *     per locked section.
 *  2. `SessionDurableObject`: one DO per session (`idFromName(sid)`) that owns the session's bus
 *     (append + SSE subscribers) and runs synthesis. Because a DO is single-threaded and unique per
 *     name, the existing in-memory LockProvider / JobTracker / bus subscriber map are correct *inside*
 *     it — the session code runs there unchanged, with `STORAGE_BACKEND=r2`.
 */
import type { LockProvider } from "./locks";

// --- minimal Workers types -------------------------------------------------------------

type DurableObjectStubLike = { fetch(input: string, init?: RequestInit): Promise<Response> };
type DurableObjectNamespaceLike = {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
};
type DurableObjectStateLike = {
  storage: {
    setAlarm(at: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
};

// --- 1. lease lock ---------------------------------------------------------------------

const LEASE_TTL_MS = 30_000;

export class LockDurableObject {
  private holder: { token: string; expires: number } | null = null;
  private waiters: (() => void)[] = [];

  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/acquire") {
      while (this.holder && this.holder.expires > Date.now()) {
        await new Promise<void>((resolve) => this.waiters.push(resolve));
      }
      const token = crypto.randomUUID();
      this.holder = { token, expires: Date.now() + LEASE_TTL_MS };
      await this.state.storage.setAlarm(this.holder.expires);
      return Response.json({ token });
    }
    if (url.pathname === "/release") {
      if (this.holder?.token === url.searchParams.get("token")) this.release();
      return new Response(null, { status: 204 });
    }
    return new Response("not found", { status: 404 });
  }

  /** TTL expiry: the holder crashed or overran; let the next waiter in. */
  async alarm(): Promise<void> {
    if (this.holder && this.holder.expires <= Date.now()) this.release();
  }

  private release(): void {
    this.holder = null;
    void this.state.storage.deleteAlarm();
    this.waiters.shift()?.();
  }
}

export class DurableLockProvider implements LockProvider {
  constructor(private readonly ns: DurableObjectNamespaceLike) {}

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const stub = this.ns.get(this.ns.idFromName(key));
    const { token } = (await (await stub.fetch("https://lock/acquire", { method: "POST" })).json()) as { token: string };
    try {
      return await fn();
    } finally {
      await stub.fetch(`https://lock/release?token=${encodeURIComponent(token)}`, { method: "POST" });
    }
  }
}

// --- 2. per-session owner --------------------------------------------------------------

/**
 * Routes (the Worker forwards `/api/sessions/:sid/*` here):
 *  - `GET  /stream?after=<seq>` → `sseResponse(sid, after)` from sse.ts, unchanged: subscribers live in
 *    this DO's memory and every `appendBus` for the session runs in this DO, so fan-out is complete.
 *  - `POST /synthesis` → saves the queued job (as `requestSynthesis` does), calls
 *    `storage.setAlarm(Date.now())` and responds with the job id at once. `alarm()` then runs the job:
 *    alarms are retried on failure and are not bound to the request's lifetime.
 *  - everything else → the existing route handler, executed inside the DO.
 */
export class SessionDurableObject {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(_req: Request): Promise<Response> {
    // Wiring sketch:
    //   setLockProvider(new InMemoryLockProvider())   // correct here: single-threaded per session
    //   setR2Bucket(env.KNOWLEDGE_BUCKET)
    //   return dispatchToRouteHandler(req)
    return new Response("not implemented", { status: 501 });
  }

  /** Runs the queued synthesis job; on retry after eviction, a `running` job is re-run or marked interrupted. */
  async alarm(): Promise<void> {
    // listSessionJobs(sid) → the queued job → runJob(job) (synthesis.ts), tracked by the in-DO JobTracker.
  }
}
