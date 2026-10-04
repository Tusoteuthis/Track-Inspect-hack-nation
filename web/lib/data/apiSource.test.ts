import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiSource, type EventSourceLike } from "@/lib/data/apiSource";
import type { SourceUpdate } from "@/lib/data/source";
import type { Ws6Evaluation, Ws6PointingEvent, Ws6Session, Ws6WorkMapView } from "@/lib/data/ws6Wire";
import type { LearnerDraft, LearnerEvaluation } from "@/lib/ui/contracts";

const BASE = "http://laptop:3006";

const ws6Session = (over: Partial<Ws6Session> = {}): Ws6Session => ({
  session_id: "ses-1",
  role: "expert",
  lifecycle: "created",
  record_state: "on_record",
  case_id: null,
  trace_ref: null,
  pinned_knowledge: null,
  source: "live",
  created_at_utc: "2026-10-04T10:00:00Z",
  rev: 1,
  ...over,
});

const region = { x: 0.1, y: 0.1, width: 0.2, height: 0.2, coordinate_space: "original_frame_normalized" as const, frame_width_px: 100, frame_height_px: 50 };

const pointingEvent = (event_id: string): Ws6PointingEvent => ({
  schema_version: "ws3.v0",
  session_id: "ses-1",
  event_id,
  source: "live",
  captured_at_utc: "2026-10-04T10:00:00Z",
  session_time_ms: 0,
  frame_id: "frm-1",
  image_ref: `/api/assets/${event_id}/original`,
  highlighted_image_ref: `/api/assets/${event_id}/highlighted`,
  region,
  mapping_status: "resolved",
  trace_id: null,
  channel_id: null,
  signal_interval: null,
  record_state: "on_record",
  asset_id: event_id,
});

const emptyWorkmap: Ws6WorkMapView = {
  include: "draft",
  produced_by: null,
  session_id: "ses-1",
  job_id: "job-1",
  generated_at_utc: null,
  steps: [],
  excluded: [],
};

const evaluation = (over: Partial<Ws6Evaluation> = {}): Ws6Evaluation => ({
  evaluation_id: "evl-1",
  session_id: "ses-n",
  draft_rev: 1,
  knowledge_revision_ids: ["rev-1"],
  status: "pending",
  outcome: null,
  cited: [],
  feedback_text: null,
  created_at_utc: "2026-10-04T10:00:00Z",
  updated_at_utc: "2026-10-04T10:00:00Z",
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, message: string, status: number) => json({ error: { code, message } }, status);

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** fetch mock keyed by "METHOD /path"; handlers may be a queue (one per call). */
function mockFetch(routes: Record<string, Handler | Handler[]>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(BASE, "");
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    const handler = Array.isArray(route) ? route.shift() : route;
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler(init);
  });
}

const bodyOf = (init: RequestInit | undefined): unknown => JSON.parse(String(init?.body));
const headersOf = (init: RequestInit | undefined) => (init?.headers ?? {}) as Record<string, string>;

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  fire(type: string, data?: unknown) {
    const event = { data: data === undefined ? undefined : JSON.stringify(data) } as MessageEvent;
    for (const l of this.listeners.get(type) ?? []) l(event);
  }
  bus(seq: number, type: string, ids: Record<string, string>) {
    this.fire(type, { seq, type, session_id: "ses-1", ids, at_utc: "2026-10-04T10:00:00Z" });
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  FakeEventSource.instances = [];
});

describe("apiSource reads", () => {
  it("maps the WS6 lifecycle through getSession", async () => {
    const fetch = mockFetch({ "GET /api/sessions/ses-1": () => json(ws6Session({ lifecycle: "aborted", rev: 3 })) });
    const source = createApiSource({ baseUrl: BASE, fetch });
    const session = await source.getSession("ses-1");
    expect(source.kind).toBe("api");
    expect(session.lifecycle).toBe("ended");
    expect(session.rev).toBe(3);
    expect(session.connection.backend).toBe("unknown");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/sessions/ses-1`, expect.anything());
  });

  it("rejects a read with the error envelope message", async () => {
    const fetch = mockFetch({ "GET /api/sessions/nope": () => apiError("not_found", "Session not found.", 404) });
    await expect(createApiSource({ baseUrl: BASE, fetch }).getSession("nope")).rejects.toThrow("Session not found.");
  });

  it("rejects with the HTTP status when the body is not an envelope", async () => {
    const fetch = mockFetch({ "GET /api/sessions/ses-1": () => new Response("oops", { status: 502 }) });
    await expect(createApiSource({ baseUrl: BASE, fetch }).getSession("ses-1")).rejects.toThrow("HTTP 502");
  });

  it("asks for the draft-inclusive Work Map", async () => {
    const fetch = mockFetch({ "GET /api/workmap?include=draft": () => json(emptyWorkmap) });
    const map = await createApiSource({ baseUrl: BASE, fetch }).getWorkMap("ses-1");
    expect(map.revision_label).toBe("Current Work Map");
  });

  it("returns the last six pointing events, oldest first, with base-prefixed refs", async () => {
    const events = Array.from({ length: 8 }, (_, i) => pointingEvent(`evt-${i}`));
    const fetch = mockFetch({ "GET /api/sessions/ses-1/events": () => json(events) });
    const recent = await createApiSource({ baseUrl: BASE, fetch }).getRecentEvents("ses-1");
    expect(recent.map(e => e.event_id)).toEqual(["evt-2", "evt-3", "evt-4", "evt-5", "evt-6", "evt-7"]);
    expect(recent[0].image_ref).toBe(`${BASE}/api/assets/evt-2/original`);
  });

  it("rejects methods WS6 has no route for", async () => {
    const source = createApiSource({ baseUrl: BASE, fetch: mockFetch({}) });
    await expect(source.getReview("ses-1")).rejects.toThrow(/not available from the backend yet/);
    await expect(source.listCases()).rejects.toThrow(/not available from the backend yet/);
    await expect(source.getPracticeCase("case-a")).rejects.toThrow(/not available from the backend yet/);
    const mark = await source.submitReviewMark({ session_id: "s", entry_id: "e", revision_id: "r", kind: "flag_unresolved" });
    expect(mark).toEqual({ status: "failed", error: expect.stringMatching(/not available from the backend yet/) });
    const frame = await source.submitScreenFrame("case-a", new Blob(), { draft_revision: 1, captured_at_utc: "x" });
    expect(frame.status).toBe("failed");
  });
});

describe("apiSource session actions", () => {
  it("creates with an Idempotency-Key and starts with the created rev", async () => {
    const fetch = mockFetch({
      "POST /api/sessions": init => {
        expect(headersOf(init)["Idempotency-Key"]).toMatch(/\S+/);
        expect(bodyOf(init)).toEqual({ role: "expert", source: "live", trace_ref: "case-a" });
        return json(ws6Session({ rev: 2 }), 201);
      },
      "POST /api/sessions/ses-1/lifecycle": init => {
        expect(bodyOf(init)).toEqual({ action: "start", rev: 2 });
        return json(ws6Session({ lifecycle: "active", rev: 3 }));
      },
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).startSession("case-a");
    expect(ack.status).toBe("acknowledged");
    if (ack.status === "acknowledged") expect(ack.value.lifecycle).toBe("active");
  });

  it("acknowledges off-record with the server's session", async () => {
    const fetch = mockFetch({
      "POST /api/sessions/ses-1/record-state": init => {
        expect(bodyOf(init)).toEqual({ state: "off_record" });
        return json(ws6Session({ record_state: "off_record", rev: 2 }));
      },
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).requestOffRecord("ses-1", true);
    expect(ack).toMatchObject({ status: "acknowledged", value: { recording_state: "off_record" } });
  });

  it("turns an error envelope into a failed ack", async () => {
    const fetch = mockFetch({
      "POST /api/sessions/ses-1/record-state": () => apiError("invalid_transition", "The session has ended.", 409),
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).requestOffRecord("ses-1", false);
    expect(ack).toEqual({ status: "failed", error: "The session has ended." });
  });

  it("turns a network error into a failed ack instead of throwing", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).requestOffRecord("ses-1", true);
    expect(ack.status).toBe("failed");
  });

  it("stops with the current rev", async () => {
    const fetch = mockFetch({
      "GET /api/sessions/ses-1": () => json(ws6Session({ lifecycle: "active", rev: 5 })),
      "POST /api/sessions/ses-1/lifecycle": init => {
        expect(bodyOf(init)).toEqual({ action: "end", rev: 5 });
        return json(ws6Session({ lifecycle: "ended", rev: 6 }));
      },
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).requestStop("ses-1");
    expect(ack).toMatchObject({ status: "acknowledged", value: { lifecycle: "ended" } });
  });

  it("reports pause as unsupported", async () => {
    const ack = await createApiSource({ baseUrl: BASE, fetch: mockFetch({}) }).requestPause("ses-1", true);
    expect(ack).toEqual({ status: "failed", error: "Pause is not supported by the backend yet." });
  });
});

const draft: LearnerDraft = { draft_id: "ses-n", draft_revision: 1, decision: "Accept", reason: "Clean baseline", region: null };

describe("apiSource learner review", () => {
  it("puts the draft, then polls the evaluation until it is done", async () => {
    const fetch = mockFetch({
      "PUT /api/sessions/ses-n/draft": init => {
        expect(bodyOf(init)).toEqual({ base_draft_rev: 0, decision: "Accept", reason: "Clean baseline", visual_context: [] });
        return json({ session_id: "ses-n", draft_rev: 1, decision: "Accept", reason: "Clean baseline", visual_context: [], updated_at_utc: "x", source: "live" }, 201);
      },
      "POST /api/sessions/ses-n/evaluations": init => {
        expect(bodyOf(init)).toEqual({ draft_rev: 1 });
        return json(evaluation(), 202);
      },
      "GET /api/sessions/ses-n/evaluations/evl-1": [
        () => json(evaluation()),
        () => json(evaluation({ status: "done", outcome: "ok", feedback_text: "Good." })),
      ],
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch, evaluationPollMs: 1 }).submitDraftForReview(draft);
    expect(ack).toMatchObject({
      status: "acknowledged",
      value: { evaluation_id: "evl-1", draft_revision: 1, outcome: "ok", message: "Good.", knowledge_revision_id: "rev-1" },
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("fails when the evaluation never finishes", async () => {
    const fetch = mockFetch({
      "PUT /api/sessions/ses-n/draft": () => json({ draft_rev: 1 }),
      "POST /api/sessions/ses-n/evaluations": () => json(evaluation(), 202),
      "GET /api/sessions/ses-n/evaluations/evl-1": () => json(evaluation()),
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch, evaluationPollMs: 1, evaluationTimeoutMs: 3 }).submitDraftForReview(draft);
    expect(ack.status).toBe("failed");
  });

  it("fails when the server evaluated a different draft revision", async () => {
    const fetch = mockFetch({
      "PUT /api/sessions/ses-n/draft": () => json({ draft_rev: 2 }),
      "POST /api/sessions/ses-n/evaluations": () => json(evaluation({ draft_rev: 2, status: "done", outcome: "ok" }), 202),
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).submitDraftForReview(draft);
    expect(ack).toEqual({ status: "failed", error: "The draft changed on the server; review again." });
  });

  it("fails a stale evaluation", async () => {
    const fetch = mockFetch({
      "PUT /api/sessions/ses-n/draft": () => json({ draft_rev: 1 }),
      "POST /api/sessions/ses-n/evaluations": () => json(evaluation({ status: "stale" }), 202),
    });
    expect((await createApiSource({ baseUrl: BASE, fetch }).submitDraftForReview(draft)).status).toBe("failed");
  });

  const reviewed: LearnerEvaluation = {
    evaluation_id: "evl-1",
    draft_revision: 1,
    knowledge_revision_id: "rev-1",
    outcome: "ok",
    message: "",
    guiding_question: null,
    citations: [],
  };

  it("commits with the caller's idempotency key", async () => {
    const fetch = mockFetch({
      "POST /api/sessions/ses-n/commit": init => {
        expect(bodyOf(init)).toEqual({ draft_rev: 1, evaluation_id: "evl-1", idempotency_key: "key-1" });
        return json({ commit_id: "cmt-1", session_id: "ses-n", draft_rev: 1, evaluation_id: "evl-1", at_utc: "2026-10-04T12:00:00Z" }, 201);
      },
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).commitDraft(draft, reviewed, { idempotency_key: "key-1" });
    expect(ack).toEqual({ status: "acknowledged", value: { committed_at_utc: "2026-10-04T12:00:00Z" } });
  });

  it("keeps the commit error code visible", async () => {
    const fetch = mockFetch({
      "POST /api/sessions/ses-n/commit": () => apiError("evaluation_stale", "The review is out of date.", 409),
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).commitDraft(draft, reviewed, { idempotency_key: "k" });
    expect(ack).toEqual({ status: "failed", error: "evaluation_stale: The review is out of date." });
  });
});

describe("apiSource trust actions", () => {
  it("revokes an entry", async () => {
    const fetch = mockFetch({
      "POST /api/knowledge/entries/ent-1/revoke": init => {
        expect(bodyOf(init)).toEqual({ reason: "Removed by the expert from the web app" });
        return json({ entry_id: "ent-1", current_revision_id: "rev-1", current_revision_no: 1, status: "revoked", updated_at_utc: "x", rev: 2 });
      },
    });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).revokeEntry("ent-1", "rev-1");
    expect(ack).toEqual({ status: "acknowledged", value: { entry_id: "ent-1", revision_id: "rev-1" } });
  });

  it("deletes evidence", async () => {
    const fetch = mockFetch({ "DELETE /api/sessions/ses-1/events/evt-1": () => json({ deleted: { event_ids: ["evt-1"] } }) });
    const ack = await createApiSource({ baseUrl: BASE, fetch }).deleteEvidence("ses-1", "evt-1");
    expect(ack).toEqual({ status: "acknowledged", value: { event_id: "evt-1", revoked_entry_ids: [] } });
  });

  it("fails a revoke the backend refuses", async () => {
    const fetch = mockFetch({ "POST /api/knowledge/entries/ent-1/revoke": () => apiError("not_found", "Unknown entry.", 404) });
    expect(await createApiSource({ baseUrl: BASE, fetch }).revokeEntry("ent-1", "rev-1")).toEqual({ status: "failed", error: "Unknown entry." });
  });
});

describe("apiSource subscribe", () => {
  function setup(routes: Record<string, Handler | Handler[]> = {}) {
    const fetch = mockFetch(routes);
    const source = createApiSource({ baseUrl: BASE, fetch, EventSource: FakeEventSource });
    const updates: SourceUpdate[] = [];
    const unsubscribe = source.subscribe("ses-1", u => updates.push(u));
    const es = FakeEventSource.instances[0];
    return { source, updates, unsubscribe, es, fetch };
  }

  it("opens the session stream and reports connection state", async () => {
    const { source, updates, es } = setup({ "GET /api/sessions/ses-1": () => json(ws6Session()) });
    expect(es.url).toBe(`${BASE}/api/sessions/ses-1/stream`);
    es.fire("open");
    expect((await source.getSession("ses-1")).connection.backend).toBe("connected");
    es.fire("error");
    expect(updates).toEqual([
      { type: "connection", state: "connected" },
      { type: "connection", state: "reconnecting" },
    ]);
  });

  it("re-fetches a stored pointing event with base-prefixed refs", async () => {
    const { updates, es } = setup({ "GET /api/sessions/ses-1/events/evt-1": () => json(pointingEvent("evt-1")) });
    es.bus(1, "event.stored", { event_id: "evt-1", asset_id: "evt-1" });
    await flush();
    expect(updates).toHaveLength(1);
    const [u] = updates;
    expect(u.type).toBe("pointing_event");
    if (u.type === "pointing_event") expect(u.event.highlighted_image_ref).toBe(`${BASE}/api/assets/evt-1/highlighted`);
  });

  it("emits knowledge and a fresh Work Map on entry.revoked", async () => {
    const { updates, es } = setup({ "GET /api/workmap?include=draft": () => json(emptyWorkmap) });
    es.bus(1, "entry.revoked", { entry_id: "ent-1", revision_id: "rev-1" });
    await flush();
    expect(updates[0]).toEqual({ type: "knowledge", entry_id: "ent-1", revision_id: "rev-1", status: "revoked" });
    expect(updates[1]).toMatchObject({ type: "workmap" });
  });

  it("re-fetches the session on record_state.changed and ignores duplicates by seq", async () => {
    const { updates, es, fetch } = setup({ "GET /api/sessions/ses-1": () => json(ws6Session({ record_state: "off_record" })) });
    es.bus(4, "record_state.changed", { segment_id: "seg-1" });
    es.fire("message", { seq: 4, type: "record_state.changed", session_id: "ses-1", ids: {}, at_utc: "x" });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(updates).toMatchObject([{ type: "session", session: { recording_state: "off_record" } }]);
  });

  it("ignores failed re-fetches and malformed messages", async () => {
    const { updates, es } = setup({ "GET /api/sessions/ses-1/events/evt-9": () => apiError("not_found", "gone", 404) });
    es.bus(1, "event.stored", { event_id: "evt-9" });
    es.fire("message", "not json");
    await flush();
    expect(updates).toEqual([]);
  });

  it("closes on unsubscribe and drops late callbacks", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const { updates, es, unsubscribe } = setup({
      "GET /api/sessions/ses-1/events/evt-1": async () => {
        await gate;
        return json(pointingEvent("evt-1"));
      },
    });
    es.bus(1, "event.stored", { event_id: "evt-1" });
    unsubscribe();
    expect(es.closed).toBe(true);
    release();
    await flush();
    es.fire("open");
    es.bus(2, "entry.revoked", { entry_id: "e", revision_id: "r" });
    await flush();
    expect(updates).toEqual([]);
  });
});
