import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeEvent, makeExchange, newExpertSession, seedAsset, useTempDirs } from "@/lib/backend/capture-test-helpers";
import { GET as listEventsRoute } from "./route";
import { GET as getEventRoute, PUT as putEventRoute } from "./[eid]/route";
import { GET as listExchangesRoute } from "../exchanges/route";
import { PUT as putExchangeRoute } from "../exchanges/[xid]/route";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-eroutes-"));
  sid = await newExpertSession();
  await seedAsset(sid, "a-1");
});

afterEach(() => cleanup());

const put = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const get = (url: string) => new Request(`http://localhost${url}`);

describe("events + exchanges routes", () => {
  it("PUT event → 201 ack, retry → 200 same ack, GET returns rewritten refs", async () => {
    const body = makeEvent(sid, "evt-001", "a-1");
    const ctx = { params: Promise.resolve({ sid, eid: "evt-001" }) };
    const first = await putEventRoute(put(`/api/sessions/${sid}/events/evt-001`, body), ctx);
    expect(first.status).toBe(201);
    const ack = await first.json();
    expect(ack).toEqual({ event_id: "evt-001", status: "stored", seq: 1 });
    const second = await putEventRoute(put(`/api/sessions/${sid}/events/evt-001`, body), {
      params: Promise.resolve({ sid, eid: "evt-001" }),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(ack);
    const got = await getEventRoute(get(`/api/sessions/${sid}/events/evt-001`), {
      params: Promise.resolve({ sid, eid: "evt-001" }),
    });
    expect((await got.json()).image_ref).toBe("/api/assets/a-1/original");
    const list = await listEventsRoute(get(`/api/sessions/${sid}/events`), { params: Promise.resolve({ sid }) });
    expect((await list.json()).map((e: { event_id: string }) => e.event_id)).toEqual(["evt-001"]);
  });

  it("missing asset → 409 envelope; malformed JSON → 400; bad id → 400", async () => {
    const res = await putEventRoute(put(`/api/sessions/${sid}/events/evt-001`, makeEvent(sid, "evt-001", "a-x")), {
      params: Promise.resolve({ sid, eid: "evt-001" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("asset_not_available");
    const bad = await putEventRoute(new Request("http://localhost/x", { method: "PUT", body: "{" }), {
      params: Promise.resolve({ sid, eid: "evt-001" }),
    });
    expect(bad.status).toBe(400);
    const badId = await getEventRoute(get("/x"), { params: Promise.resolve({ sid, eid: "..%2Fetc" }) });
    expect(badId.status).toBe(400);
  });

  it("PUT exchange 201, stale rev 409 stale_revision, list returns it", async () => {
    await putEventRoute(put("/x", makeEvent(sid, "evt-001", "a-1")), { params: Promise.resolve({ sid, eid: "evt-001" }) });
    const ctx = () => ({ params: Promise.resolve({ sid, xid: "x-1" }) });
    expect((await putExchangeRoute(put("/x", makeExchange(sid, "x-1", "evt-001", 2, 2)), ctx())).status).toBe(201);
    const stale = await putExchangeRoute(put("/x", makeExchange(sid, "x-1", "evt-001", 1)), ctx());
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toMatchObject({ code: "stale_revision", details: { current_rev: 2 } });
    const list = await listExchangesRoute(get("/x"), { params: Promise.resolve({ sid }) });
    expect((await list.json())[0]).toMatchObject({ exchange_id: "x-1", event_id: "evt-001", rev: 2 });
  });
});
