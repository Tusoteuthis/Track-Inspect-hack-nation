import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBusAfter } from "./bus";
import { codeOf, errorOf, makeEvent, newExpertSession, seedAsset, useTempDirs } from "./capture-test-helpers";
import { getEvent, listEvents, putEvent } from "./events";
import { sessionDir } from "./paths";
import { changeLifecycle, changeRecordState } from "./sessions";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-events-"));
  sid = await newExpertSession();
  await seedAsset(sid, "a-1");
});

afterEach(() => cleanup());

const eventsDir = () => path.join(sessionDir(sid), "events");
const eventFiles = async () => fsp.readdir(eventsDir()).catch(() => [] as string[]);

describe("putEvent", () => {
  it("stores the event, rewrites image refs to the asset URLs and acks with the event.stored seq", async () => {
    const r = await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
    expect(r.status).toBe(201);
    const bus = await readBusAfter(sid, 0);
    expect(bus.map((e) => [e.type, e.ids])).toEqual([["event.stored", { event_id: "evt-001", asset_id: "a-1" }]]);
    expect(r.ack).toEqual({ event_id: "evt-001", status: "stored", seq: bus[0].seq });
    const stored = await getEvent(sid, "evt-001");
    expect(stored.image_ref).toBe("/api/assets/a-1/original");
    expect(stored.highlighted_image_ref).toBe("/api/assets/a-1/highlighted");
  });

  it("the same event PUT twice → one file, the same ack, one bus event", async () => {
    const body = makeEvent(sid, "evt-001", "a-1");
    const first = await putEvent(sid, "evt-001", body);
    const second = await putEvent(sid, "evt-001", structuredClone(body));
    expect(second.status).toBe(200);
    expect(second.ack).toEqual(first.ack);
    expect(await eventFiles()).toEqual(["evt-001.json"]);
    expect(await readBusAfter(sid, 0)).toHaveLength(1);
  });

  it("concurrent duplicate deliveries → one file, identical acks, one bus event", async () => {
    const body = makeEvent(sid, "evt-001", "a-1");
    const results = await Promise.all(Array.from({ length: 5 }, () => putEvent(sid, "evt-001", body)));
    expect(new Set(results.map((r) => JSON.stringify(r.ack))).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await readBusAfter(sid, 0)).toHaveLength(1);
  });

  it("the same event_id with a different body → 409 conflict_immutable, stored record unchanged", async () => {
    await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
    const before = await fsp.readFile(path.join(eventsDir(), "evt-001.json"), "utf8");
    const changed = makeEvent(sid, "evt-001", "a-1", { mapping_status: "ambiguous" });
    expect(await codeOf(putEvent(sid, "evt-001", changed))).toBe("conflict_immutable");
    expect(await fsp.readFile(path.join(eventsDir(), "evt-001.json"), "utf8")).toBe(before);
    expect(await readBusAfter(sid, 0)).toHaveLength(1);
  });

  it("an event referencing a missing asset → 409 asset_not_available, nothing stored, no bus event", async () => {
    const err = await errorOf(putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-missing")));
    expect(err.code).toBe("asset_not_available");
    expect(err.details).toMatchObject({ asset_id: "a-missing" });
    expect(await eventFiles()).toEqual([]);
    expect(await readBusAfter(sid, 0)).toEqual([]);
  });

  it("asset of another session, deleted asset, or asset without highlighted → asset_not_available", async () => {
    const other = await newExpertSession();
    await seedAsset(other, "a-other");
    await seedAsset(sid, "a-deleted", { status: "deleted" });
    await seedAsset(sid, "a-nohl", { highlighted: null });
    expect(await codeOf(putEvent(sid, "evt-1", makeEvent(sid, "evt-1", "a-other")))).toBe("asset_not_available");
    expect(await codeOf(putEvent(sid, "evt-2", makeEvent(sid, "evt-2", "a-deleted")))).toBe("asset_not_available");
    const err = await errorOf(putEvent(sid, "evt-3", makeEvent(sid, "evt-3", "a-nohl")));
    expect(err.details).toMatchObject({ asset_id: "a-nohl", missing: "highlighted" });
    expect(await eventFiles()).toEqual([]);
  });

  it("after the asset arrives, the retried event is accepted (upload-first contract)", async () => {
    expect(await codeOf(putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-late")))).toBe("asset_not_available");
    await seedAsset(sid, "a-late");
    expect((await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-late"))).status).toBe(201);
  });

  it("validates the body and path/body ID agreement", async () => {
    expect(await codeOf(putEvent(sid, "evt-001", { nope: true }))).toBe("validation_failed");
    expect(await codeOf(putEvent(sid, "evt-002", makeEvent(sid, "evt-001", "a-1")))).toBe("validation_failed");
    expect(await codeOf(putEvent(sid, "evt-001", makeEvent("ses-other", "evt-001", "a-1")))).toBe("validation_failed");
    const { asset_id: _a, ...noAsset } = makeEvent(sid, "evt-001", "a-1");
    expect(await codeOf(putEvent(sid, "evt-001", noAsset))).toBe("validation_failed");
    expect(await codeOf(putEvent(sid, "../x", makeEvent(sid, "evt-001", "a-1")))).toBe("validation_failed");
  });

  it("drops off-record events (202, nothing stored) and refuses aborted sessions", async () => {
    const dropped = { status: 202, dropped: { status: "dropped_off_record", kind: "event", id: "evt-001" } };
    expect(await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1", { record_state: "off_record" }))).toEqual(dropped);
    await changeRecordState(sid, { state: "off_record" });
    expect((await putEvent(sid, "evt-002", makeEvent(sid, "evt-002", "a-1"))).status).toBe(202);
    await changeRecordState(sid, { state: "on_record" });
    const s2 = await newExpertSession();
    await seedAsset(s2, "a-2");
    await changeLifecycle(s2, { action: "abort", rev: 1 });
    expect(await codeOf(putEvent(s2, "evt-001", makeEvent(s2, "evt-001", "a-2")))).toBe("invalid_transition");
    expect(await eventFiles()).toEqual([]);
  });

  it("an identical retry of a stored event still gets its ack after the session went off-record", async () => {
    const first = await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
    await changeRecordState(sid, { state: "off_record" });
    const retry = await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
    expect(retry).toEqual({ status: 200, ack: first.ack });
  });

  it("late events are accepted after the session ended", async () => {
    await changeLifecycle(sid, { action: "start", rev: 1 });
    await changeLifecycle(sid, { action: "end", rev: 2 });
    expect((await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"))).status).toBe(201);
  });

  it("recovers the ack seq when the bus line was lost (crash between write and publish)", async () => {
    const body = makeEvent(sid, "evt-001", "a-1");
    await putEvent(sid, "evt-001", body);
    await fsp.rm(path.join(sessionDir(sid), "bus.ndjson"));
    const retry = await putEvent(sid, "evt-001", body);
    expect(retry.status).toBe(200);
    const bus = await readBusAfter(sid, 0);
    expect(bus.filter((e) => e.type === "event.stored")).toHaveLength(1);
    expect(retry.ack!.seq).toBe(bus[bus.length - 1].seq);
  });
});

describe("listEvents / getEvent", () => {
  it("orders by captured_at_utc, then arrival", async () => {
    await putEvent(sid, "evt-c", makeEvent(sid, "evt-c", "a-1", { captured_at_utc: "2026-10-03T10:00:30.000Z" }));
    await putEvent(sid, "evt-b", makeEvent(sid, "evt-b", "a-1", { captured_at_utc: "2026-10-03T10:00:10.000Z" }));
    await putEvent(sid, "evt-a", makeEvent(sid, "evt-a", "a-1", { captured_at_utc: "2026-10-03T10:00:10.000Z" }));
    await putEvent(sid, "evt-0", makeEvent(sid, "evt-0", "a-1", { captured_at_utc: "2026-10-03T10:00:01.000Z" }));
    expect((await listEvents(sid)).map((e) => e.event_id)).toEqual(["evt-0", "evt-b", "evt-a", "evt-c"]);
  });

  it("empty list for a session without events; 404 for unknown session or event", async () => {
    expect(await listEvents(sid)).toEqual([]);
    expect(await codeOf(listEvents("ses-nope"))).toBe("not_found");
    expect(await codeOf(getEvent(sid, "evt-nope"))).toBe("not_found");
  });
});
