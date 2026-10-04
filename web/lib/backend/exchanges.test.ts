import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBusAfter } from "./bus";
import { codeOf, errorOf, makeEvent, makeExchange, newExpertSession, seedAsset, useTempDirs } from "./capture-test-helpers";
import { putEvent } from "./events";
import { getExchange, listExchanges, putExchange } from "./exchanges";
import { sessionDir } from "./paths";
import { changeLifecycle, changeRecordState } from "./sessions";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-exchanges-"));
  sid = await newExpertSession();
  await seedAsset(sid, "a-1");
  await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
});

afterEach(() => cleanup());

const exchangeFile = (xid: string) => path.join(sessionDir(sid), "exchanges", `${xid}.json`);
const exchangeEvents = async () => (await readBusAfter(sid, 0)).filter((e) => e.type === "exchange.updated");

describe("putExchange", () => {
  it("creates (201) then accepts higher revs (200), emitting exchange.updated each time", async () => {
    const created = await putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", 1));
    expect(created.status).toBe(201);
    const updated = await putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", 2, 2));
    expect(updated.status).toBe(200);
    expect((await getExchange(sid, "x-1")).answer_lines).toHaveLength(2);
    expect((await exchangeEvents()).map((e) => e.ids)).toEqual([
      { exchange_id: "x-1", event_id: "evt-001" },
      { exchange_id: "x-1", event_id: "evt-001" },
    ]);
  });

  it("an identical retry is a 200 no-op without a bus event", async () => {
    const body = makeExchange(sid, "x-1", "evt-001", 1);
    await putExchange(sid, "x-1", body);
    const retry = await putExchange(sid, "x-1", structuredClone(body));
    expect(retry.status).toBe(200);
    expect(await exchangeEvents()).toHaveLength(1);
  });

  it("a stale rev is rejected (409 stale_revision, current_rev) and the stored record is unchanged", async () => {
    await putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", 3, 3));
    const before = await fsp.readFile(exchangeFile("x-1"), "utf8");
    for (const rev of [1, 3]) {
      const err = await errorOf(putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", rev, 1)));
      expect(err.code).toBe("stale_revision");
      expect(err.details).toMatchObject({ current_rev: 3, received_rev: rev });
    }
    expect(await fsp.readFile(exchangeFile("x-1"), "utf8")).toBe(before);
    expect(await exchangeEvents()).toHaveLength(1);
  });

  it("changing event_id → 409 conflict_immutable, even with a higher rev", async () => {
    await seedAsset(sid, "a-2");
    await putEvent(sid, "evt-002", makeEvent(sid, "evt-002", "a-2"));
    await putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", 1));
    const err = await errorOf(putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-002", 2)));
    expect(err.code).toBe("conflict_immutable");
    expect(err.details).toMatchObject({ field: "event_id" });
    expect(await codeOf(putExchange(sid, "x-1", makeExchange(sid, "x-1", null, 2)))).toBe("conflict_immutable");
    expect((await getExchange(sid, "x-1")).event_id).toBe("evt-001");
  });

  it("a late answer appended after newer events still references its original event", async () => {
    await putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", 1, 1));
    for (const n of [2, 3]) {
      await seedAsset(sid, `a-${n}`);
      await putEvent(sid, `evt-00${n}`, makeEvent(sid, `evt-00${n}`, `a-${n}`));
    }
    const late = { ...makeExchange(sid, "x-1", "evt-001", 2, 3), answer_ended_at_utc: "2026-10-03T10:00:40.000Z" };
    expect((await putExchange(sid, "x-1", late)).status).toBe(200);
    const stored = await getExchange(sid, "x-1");
    expect(stored.event_id).toBe("evt-001");
    expect(stored.answer_lines).toHaveLength(3);
    const bus = await readBusAfter(sid, 0);
    expect(bus[bus.length - 1]).toMatchObject({ type: "exchange.updated", ids: { exchange_id: "x-1", event_id: "evt-001" } });
  });

  it("a non-null event_id must reference a stored event of this session → 404 not_found", async () => {
    const err = await errorOf(putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-nope", 1)));
    expect(err.code).toBe("not_found");
    expect(err.details).toMatchObject({ missing: "event", event_id: "evt-nope" });
    await expect(fsp.access(exchangeFile("x-1"))).rejects.toThrow();
  });

  it("event_id null is allowed (debrief questions)", async () => {
    expect((await putExchange(sid, "x-d", { ...makeExchange(sid, "x-d", null, 1), phase: "debrief" })).status).toBe(201);
    expect((await exchangeEvents())[0].ids).toEqual({ exchange_id: "x-d" });
  });

  it("validates body, rev and path/body ID agreement", async () => {
    const { rev: _r, ...noRev } = makeExchange(sid, "x-1", "evt-001", 1);
    expect(await codeOf(putExchange(sid, "x-1", noRev))).toBe("validation_failed");
    expect(await codeOf(putExchange(sid, "x-2", makeExchange(sid, "x-1", "evt-001", 1)))).toBe("validation_failed");
    expect(await codeOf(putExchange(sid, "x-1", makeExchange("ses-x", "x-1", "evt-001", 1)))).toBe("validation_failed");
    expect(await codeOf(putExchange(sid, "../x", makeExchange(sid, "x-1", "evt-001", 1)))).toBe("validation_failed");
  });

  it("drops off-record exchanges and new exchanges while off-record (202); refuses aborted sessions", async () => {
    const r = await putExchange(sid, "x-1", { ...makeExchange(sid, "x-1", "evt-001", 1), record_state: "off_record" });
    expect(r).toEqual({ status: 202, dropped: { status: "dropped_off_record", kind: "exchange", id: "x-1" } });
    await changeRecordState(sid, { state: "off_record" });
    expect((await putExchange(sid, "x-2", makeExchange(sid, "x-2", "evt-001", 1))).status).toBe(202);
    expect(await codeOf(getExchange(sid, "x-2"))).toBe("not_found");
    await changeLifecycle(sid, { action: "abort", rev: 2 });
    expect(await codeOf(putExchange(sid, "x-1", makeExchange(sid, "x-1", "evt-001", 1)))).toBe("invalid_transition");
  });
});

describe("listExchanges / getExchange", () => {
  it("lists in asked_at order; 404 for unknown", async () => {
    await putExchange(sid, "x-b", { ...makeExchange(sid, "x-b", "evt-001", 1), asked_at_utc: "2026-10-03T10:01:00.000Z" });
    await putExchange(sid, "x-a", { ...makeExchange(sid, "x-a", "evt-001", 1), asked_at_utc: "2026-10-03T10:00:30.000Z" });
    expect((await listExchanges(sid)).map((x) => x.exchange_id)).toEqual(["x-a", "x-b"]);
    expect(await codeOf(getExchange(sid, "x-nope"))).toBe("not_found");
    expect(await codeOf(listExchanges("ses-nope"))).toBe("not_found");
  });
});
