import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BusEvent } from "@/lib/contracts";
import { appendBus, busFile, findBusSeq, readBusAfter, subscribe } from "./bus";
import { resetConfig, setConfigForTests } from "./config";
import { ApiError } from "./errors";

let dir: string;
const SID = "ses-bus-1";

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-bus-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

describe("appendBus", () => {
  it("assigns a monotonic per-session seq starting at 1 and persists each line", async () => {
    const a = await appendBus(SID, "event.stored", { event_id: "evt-001" });
    const b = await appendBus(SID, "exchange.updated", { exchange_id: "x-1", event_id: "evt-001" });
    const other = await appendBus("ses-other", "session.updated", { session_id: "ses-other" });
    expect([a.seq, b.seq, other.seq]).toEqual([1, 2, 1]);
    const lines = (await fsp.readFile(busFile(SID), "utf8")).trim().split("\n");
    expect(lines.map((l) => (JSON.parse(l) as BusEvent).seq)).toEqual([1, 2]);
  });

  it("serializes concurrent appends without duplicate seqs", async () => {
    const events = await Promise.all(Array.from({ length: 20 }, (_, i) => appendBus(SID, "event.stored", { event_id: `evt-${i}` })));
    expect(events.map((e) => e.seq).sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("continues the seq from an existing log (process restart)", async () => {
    await fsp.mkdir(path.dirname(busFile(SID)), { recursive: true });
    const old: BusEvent = { seq: 7, type: "event.stored", session_id: SID, ids: { event_id: "e" }, at_utc: "2026-10-04T00:00:00.000Z" };
    await fsp.writeFile(busFile(SID), JSON.stringify(old) + "\n");
    expect((await appendBus(SID, "event.stored", { event_id: "f" })).seq).toBe(8);
  });

  it("rejects content in ids (BusEvent is IDs only)", async () => {
    await expect(appendBus(SID, "event.stored", { note: "The expert said it looks wrong" })).rejects.toBeInstanceOf(ApiError);
    await expect(fsp.access(busFile(SID))).rejects.toThrow();
  });

  it("persists before publishing", async () => {
    const seen: number[] = [];
    const unsubscribe = subscribe(SID, async (e) => {
      const persisted = await readBusAfter(SID, 0);
      seen.push(persisted.some((p) => p.seq === e.seq) ? e.seq : -1);
    });
    await appendBus(SID, "event.stored", { event_id: "evt-001" });
    await new Promise((r) => setTimeout(r, 10));
    unsubscribe();
    expect(seen).toEqual([1]);
  });
});

describe("readBusAfter (replay)", () => {
  it("returns exactly the events after the given seq, in order", async () => {
    for (let i = 1; i <= 5; i++) await appendBus(SID, "event.stored", { event_id: `evt-00${i}` });
    const missed = await readBusAfter(SID, 2);
    expect(missed.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(missed.map((e) => e.ids.event_id)).toEqual(["evt-003", "evt-004", "evt-005"]);
    expect(await readBusAfter(SID, 5)).toEqual([]);
    expect(await readBusAfter(SID, 99)).toEqual([]);
  });

  it("returns [] for a session without a log", async () => {
    expect(await readBusAfter("ses-none", 0)).toEqual([]);
  });

  it("skips a torn final line", async () => {
    await appendBus(SID, "event.stored", { event_id: "evt-001" });
    await fsp.appendFile(busFile(SID), '{"seq":2,"type":"ev');
    expect((await readBusAfter(SID, 0)).map((e) => e.seq)).toEqual([1]);
  });
});

describe("subscribe", () => {
  it("delivers live events to the session's subscribers until unsubscribed", async () => {
    const got: BusEvent[] = [];
    const other: BusEvent[] = [];
    const unsubscribe = subscribe(SID, (e) => void got.push(e));
    const unsubOther = subscribe("ses-other", (e) => void other.push(e));
    await appendBus(SID, "event.stored", { event_id: "evt-001" });
    unsubscribe();
    await appendBus(SID, "event.stored", { event_id: "evt-002" });
    unsubOther();
    expect(got.map((e) => e.seq)).toEqual([1]);
    expect(other).toEqual([]);
  });

  it("a throwing subscriber does not break append or other subscribers", async () => {
    const got: number[] = [];
    const u1 = subscribe(SID, () => {
      throw new Error("boom");
    });
    const u2 = subscribe(SID, (e) => void got.push(e.seq));
    await expect(appendBus(SID, "event.stored", { event_id: "evt-001" })).resolves.toMatchObject({ seq: 1 });
    u1();
    u2();
    expect(got).toEqual([1]);
  });
});

describe("findBusSeq", () => {
  it("finds the seq of the first matching event", async () => {
    await appendBus(SID, "asset.stored", { asset_id: "a-1" });
    await appendBus(SID, "event.stored", { event_id: "evt-001", asset_id: "a-1" });
    expect(await findBusSeq(SID, (e) => e.type === "event.stored" && e.ids.event_id === "evt-001")).toBe(2);
    expect(await findBusSeq(SID, (e) => e.ids.event_id === "nope")).toBeNull();
  });
});
