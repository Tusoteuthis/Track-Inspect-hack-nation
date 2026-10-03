import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BusEvent } from "@/lib/contracts";
import { appendBus, busFile } from "./bus";
import { resetConfig, setConfigForTests } from "./config";
import { parseAfter, sessionStream } from "./sse";

let dir: string;
const SID = "ses-sse-1";

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-sse-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

type Msg = { id: number; event: string; data: BusEvent };

/** Incremental SSE reader: accumulates text and parses complete messages. */
function sseReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let done = false;

  const messages = (): Msg[] =>
    text
      .split("\n\n")
      .slice(0, -1)
      .filter((block) => block.startsWith("id: "))
      .map((block) => {
        const fields = Object.fromEntries(
          block.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2)]),
        );
        return { id: Number(fields.id), event: fields.event, data: JSON.parse(fields.data) as BusEvent };
      });

  // One in-flight read at a time; a timeout never drops a chunk that arrives later.
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  async function step(ms: number): Promise<boolean> {
    pending ??= reader.read();
    const result = await Promise.race([pending, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
    if (result === "timeout") return false;
    pending = null;
    if (result.done) done = true;
    else text += decoder.decode(result.value, { stream: true });
    return true;
  }

  async function until(pred: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!pred()) {
      if (done) throw new Error(`stream ended before condition; got: ${JSON.stringify(text)}`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timeout; got: ${JSON.stringify(text)}`);
      await step(remaining);
    }
  }

  /** Reads whatever arrives within `ms` (used to assert nothing more comes). */
  async function drain(ms: number): Promise<void> {
    const deadline = Date.now() + ms;
    while (!done && Date.now() < deadline) {
      if (!(await step(Math.max(1, deadline - Date.now())))) break;
    }
  }

  return {
    reader,
    messages,
    ids: () => messages().map((m) => m.id),
    text: () => text,
    isDone: () => done,
    until,
    drain,
  };
}

const append = (n: number) => appendBus(SID, "event.stored", { event_id: `evt-00${n}` });

function subscriberCount(): number {
  const bus = (globalThis as { __ws6Bus?: { subscribers: Map<string, Set<unknown>> } }).__ws6Bus;
  return bus?.subscribers.get(busFile(SID))?.size ?? 0;
}

describe("sessionStream", () => {
  it("replays exactly the events after `after`, in order, then continues live", async () => {
    for (let i = 1; i <= 5; i++) await append(i);
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: 2, signal: ac.signal }));
    await r.until(() => r.ids().length >= 3);
    expect(r.ids()).toEqual([3, 4, 5]);
    expect(r.messages().map((m) => m.event)).toEqual(["event.stored", "event.stored", "event.stored"]);
    await append(6);
    await r.until(() => r.ids().length >= 4);
    expect(r.ids()).toEqual([3, 4, 5, 6]);
    ac.abort();
  });

  it("neither loses nor duplicates events appended while replaying", async () => {
    for (let i = 1; i <= 3; i++) await append(i);
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: 0, signal: ac.signal }));
    // Append concurrently with the stream's replay (before anything was read).
    await Promise.all([4, 5, 6, 7].map((n) => append(n)));
    await r.until(() => r.ids().length >= 7);
    await r.drain(50);
    expect(r.ids()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    ac.abort();
  });

  it("fills a live gap from the log when publishes arrive out of order", async () => {
    await append(1);
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: 0, signal: ac.signal }));
    await r.until(() => r.ids().length >= 1);
    // Persist seq 2 and 3, but publish only 3 (as if 3's publish overtook 2's).
    const mk = (seq: number): BusEvent => ({ seq, type: "event.stored", session_id: SID, ids: { event_id: `evt-00${seq}` }, at_utc: "2026-10-04T00:00:00.000Z" });
    await fsp.appendFile(busFile(SID), JSON.stringify(mk(2)) + "\n" + JSON.stringify(mk(3)) + "\n");
    const bus = (globalThis as { __ws6Bus?: { subscribers: Map<string, Set<(e: BusEvent) => void>> } }).__ws6Bus;
    for (const listener of bus?.subscribers.get(busFile(SID)) ?? []) listener(mk(3));
    await r.until(() => r.ids().length >= 3);
    for (const listener of bus?.subscribers.get(busFile(SID)) ?? []) listener(mk(2)); // late publish: ignored
    await r.drain(30);
    expect(r.ids()).toEqual([1, 2, 3]);
    ac.abort();
  });

  it("with after=null sends only live events", async () => {
    for (let i = 1; i <= 3; i++) await append(i);
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: null, signal: ac.signal }));
    await r.drain(30);
    expect(r.ids()).toEqual([]);
    await append(4);
    await r.until(() => r.ids().length >= 1);
    expect(r.ids()).toEqual([4]);
    ac.abort();
  });

  it("writes a heartbeat comment every heartbeatMs", async () => {
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: null, signal: ac.signal, heartbeatMs: 20 }));
    await r.until(() => r.text().split(": hb\n\n").length - 1 >= 2);
    expect(r.text()).toContain(": hb\n\n");
    ac.abort();
  });

  it("formats messages as id/event/data with only BusEvent keys in data", async () => {
    await append(1);
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: 0, signal: ac.signal }));
    await r.until(() => r.ids().length >= 1);
    expect(r.text()).toMatch(/(^|\n\n)id: 1\nevent: event\.stored\ndata: \{.*\}\n\n/);
    const [msg] = r.messages();
    expect(Object.keys(msg.data).sort()).toEqual(["at_utc", "ids", "seq", "session_id", "type"]);
    expect(msg.data).toMatchObject({ seq: 1, type: "event.stored", session_id: SID, ids: { event_id: "evt-001" } });
    ac.abort();
  });

  it("ends the stream and unsubscribes on abort", async () => {
    const ac = new AbortController();
    const r = sseReader(sessionStream(SID, { after: 0, signal: ac.signal, heartbeatMs: 10 }));
    await append(1);
    await r.until(() => r.ids().length >= 1);
    expect(subscriberCount()).toBe(1);
    ac.abort();
    await r.until(() => r.isDone());
    expect(subscriberCount()).toBe(0);
    await append(2);
    expect(r.ids()).toEqual([1]);
  });

  it("an already-aborted signal yields a closed stream with no subscriber", async () => {
    const ac = new AbortController();
    ac.abort();
    const r = sseReader(sessionStream(SID, { after: 0, signal: ac.signal }));
    await r.until(() => r.isDone());
    expect(subscriberCount()).toBe(0);
  });

  it("unsubscribes on cancel() and survives appends afterwards", async () => {
    const stream = sessionStream(SID, { after: null, heartbeatMs: 10 });
    const reader = stream.getReader();
    await new Promise((r) => setTimeout(r, 5));
    expect(subscriberCount()).toBe(1);
    await reader.cancel();
    expect(subscriberCount()).toBe(0);
    await append(1);
    await new Promise((r) => setTimeout(r, 30));
  });
});

describe("parseAfter", () => {
  const req = (url: string, lastEventId?: string) =>
    new Request(url, lastEventId === undefined ? {} : { headers: { "Last-Event-ID": lastEventId } });
  const base = "http://x/api/sessions/s/stream";

  it("reads ?after=", () => {
    expect(parseAfter(req(`${base}?after=0`))).toBe(0);
    expect(parseAfter(req(`${base}?after=42`))).toBe(42);
  });
  it("prefers Last-Event-ID over ?after=", () => {
    expect(parseAfter(req(`${base}?after=1`, "7"))).toBe(7);
  });
  it("returns null when absent or invalid", () => {
    expect(parseAfter(req(base))).toBeNull();
    for (const bad of ["-1", "1.5", "abc", "", " 3", "1e3", "0x10"]) {
      expect(parseAfter(req(`${base}?after=${encodeURIComponent(bad)}`))).toBeNull();
    }
    expect(parseAfter(req(base, "nope"))).toBeNull();
  });
  it("an invalid Last-Event-ID still wins (null), not falling back to ?after=", () => {
    expect(parseAfter(req(`${base}?after=3`, "nope"))).toBeNull();
  });
});
