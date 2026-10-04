// DataSource backed by the WS6 backend (notes/ws6-api-v0.md). Reads reject with a
// human message; actions resolve with an Ack and never throw. All WS6 → UI shape
// translation lives in ws6Mappers.
import type { PointingEvent } from "@/lib/expert/contracts";
import { acknowledged, failed, type Ack, type DataSource, type SourceUpdate } from "@/lib/data/source";
import {
  mapAssessment,
  mapEvaluation,
  mapPointingEvent,
  mapSession,
  mapWorkMap,
  parseApiError,
} from "@/lib/data/ws6Mappers";
import type {
  Ws6Assessment,
  Ws6BusEvent,
  Ws6Commit,
  Ws6Evaluation,
  Ws6KnowledgeEntry,
  Ws6LearnerDraft,
  Ws6PointingEvent,
  Ws6Session,
  Ws6WorkMapView,
} from "@/lib/data/ws6Wire";
import type { ConnectionState, LearnerEvaluation, SessionView } from "@/lib/ui/contracts";

/** The subset of the browser EventSource that apiSource uses (lets tests pass a fake). */
export type EventSourceLike = {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
};
export type EventSourceCtor = new (url: string) => EventSourceLike;

export type ApiSourceOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  EventSource?: EventSourceCtor;
  evaluationPollMs?: number;
  evaluationTimeoutMs?: number;
};

type Result<T> = { ok: true; data: T } | { ok: false; code: string | null; message: string };

const EVENT_SOURCE_CLOSED = 2;
const RECENT_EVENTS = 6;
const SESSION_TYPES = ["session.updated", "record_state.changed"];
const WORKMAP_TYPES = ["revision.created", "confirmation.stored", "synthesis.done", "entry.revoked"];
const BUS_TYPES = [...SESSION_TYPES, ...WORKMAP_TYPES, "event.stored"];

const notAvailable = (what: string) => `${what} is not available from the backend yet.`;
const enc = encodeURIComponent;

/** Idempotency keys. crypto.randomUUID exists only in secure contexts (not on plain-http LAN). */
function newKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function parseBusEvent(data: unknown): Ws6BusEvent | null {
  if (typeof data !== "string") return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== "object" || value === null) return null;
    const e = value as Partial<Ws6BusEvent>;
    if (typeof e.type !== "string" || typeof e.seq !== "number" || typeof e.ids !== "object" || e.ids === null) {
      return null;
    }
    return e as Ws6BusEvent;
  } catch {
    return null;
  }
}

const idOf = (e: Ws6BusEvent, key: string): string | null => {
  const v = e.ids[key];
  return typeof v === "string" ? v : null;
};

export function createApiSource(options: ApiSourceOptions = {}): DataSource {
  const baseUrl = options.baseUrl ?? "";
  // Wrapped so the browser's fetch is never called detached from window ("Illegal invocation").
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const pollMs = options.evaluationPollMs ?? 500;
  const timeoutMs = options.evaluationTimeoutMs ?? 20000;

  // Latest EventSource state; getSession reports it as connection.backend.
  let backend: ConnectionState = "unknown";
  let openSubscriptions = 0;

  async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Result<T>> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: null, message: "Could not reach the backend." };
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // Empty or non-JSON body; the status decides.
    }
    if (!res.ok) return { ok: false, ...parseApiError(json, res.status) };
    return { ok: true, data: json as T };
  }

  async function read<T>(path: string): Promise<T> {
    const r = await request<T>("GET", path);
    if (!r.ok) throw new Error(r.message);
    return r.data;
  }

  const session = (sid: string) => `/api/sessions/${enc(sid)}`;
  const readSession = async (sid: string) => mapSession(await read<Ws6Session>(session(sid)), backend);
  const readWorkMap = async (sid: string) =>
    // include=draft: review/debrief must see non-confirmed items too; each is status-labelled.
    mapWorkMap(await read<Ws6WorkMapView>("/api/workmap?include=draft"), sid, baseUrl);
  const readEvent = async (sid: string, eid: string) =>
    mapPointingEvent(await read<Ws6PointingEvent>(`${session(sid)}/events/${enc(eid)}`), baseUrl);

  async function sessionAction(path: string, body: unknown): Promise<Ack<SessionView>> {
    const r = await request<Ws6Session>("POST", path, body);
    return r.ok ? acknowledged(mapSession(r.data, backend)) : failed(r.message);
  }

  async function lifecycle(sid: string, action: "start" | "end", rev: number): Promise<Ack<SessionView>> {
    return sessionAction(`${session(sid)}/lifecycle`, { action, rev });
  }

  async function pollEvaluation(sid: string, evaluation: Ws6Evaluation): Promise<Result<Ws6Evaluation>> {
    let current = evaluation;
    const attempts = Math.max(1, Math.ceil(timeoutMs / Math.max(1, pollMs)));
    for (let i = 0; current.status === "pending"; i++) {
      if (i >= attempts) return { ok: false, code: null, message: "The review took too long. Try again." };
      await sleep(pollMs);
      const r = await request<Ws6Evaluation>("GET", `${session(sid)}/evaluations/${enc(current.evaluation_id)}`);
      if (!r.ok) return r;
      current = r.data;
    }
    return { ok: true, data: current };
  }

  return {
    kind: "api",

    getSession: readSession,
    getWorkMap: readWorkMap,

    async getRecentEvents(sid: string): Promise<PointingEvent[]> {
      const events = await read<Ws6PointingEvent[]>(`${session(sid)}/events`);
      // WS6 orders by captured_at_utc, so the tail is the most recent, oldest first.
      return events.slice(-RECENT_EVENTS).map(e => mapPointingEvent(e, baseUrl));
    },

    // WS6 S3 promises GET /api/cases/:case_id, but LearnerCase has no defined shape yet.
    getPracticeCase: () => Promise.reject(new Error("Practice cases are not available from the backend yet.")),

    async getAssessment(sid) {
      return mapAssessment(await read<Ws6Assessment>(`${session(sid)}/assessment`));
    },

    getReview: () => Promise.reject(new Error(notAvailable("The debrief review"))),
    listCases: () => Promise.reject(new Error(notAvailable("The case list"))),

    async startSession(caseId) {
      const created = await request<Ws6Session>(
        "POST",
        "/api/sessions",
        { role: "expert", source: "live", trace_ref: caseId },
        { "Idempotency-Key": newKey() }
      );
      if (!created.ok) return failed(created.message);
      return lifecycle(created.data.session_id, "start", created.data.rev);
    },

    requestOffRecord: (sid, offRecord) =>
      sessionAction(`${session(sid)}/record-state`, { state: offRecord ? "off_record" : "on_record" }),

    // WS6 v0 has no paused lifecycle (WS7-Q2).
    requestPause: async () => failed("Pause is not supported by the backend yet."),

    async requestStop(sid) {
      const current = await request<Ws6Session>("GET", session(sid));
      if (!current.ok) return failed(current.message);
      return lifecycle(sid, "end", current.data.rev);
    },

    async submitDraftForReview(draft): Promise<Ack<LearnerEvaluation>> {
      // WS6 maps the UI draft_id to the newcomer session id (api-v0 §8 WS7 table).
      const sid = draft.draft_id;
      const put = await request<Ws6LearnerDraft>("PUT", `${session(sid)}/draft`, {
        base_draft_rev: draft.draft_revision - 1,
        decision: draft.decision,
        reason: draft.reason,
        // A UI region has no asset id or frame size, which WS6 visual_context requires.
        visual_context: [],
      });
      if (!put.ok) return failed(put.message);
      const started = await request<Ws6Evaluation>("POST", `${session(sid)}/evaluations`, { draft_rev: put.data.draft_rev });
      if (!started.ok) return failed(started.message);
      const done = await pollEvaluation(sid, started.data);
      if (!done.ok) return failed(done.message);
      if (done.data.status === "failed") return failed("The review could not be completed. Try again.");
      if (done.data.status === "stale") return failed("The review is out of date; review again.");
      if (done.data.draft_rev !== draft.draft_revision) return failed("The draft changed on the server; review again.");
      return acknowledged(mapEvaluation(done.data));
    },

    async commitDraft(draft, evaluation, opts) {
      if (!evaluation.evaluation_id) return failed("This review has no backend id; review again.");
      const r = await request<Ws6Commit>("POST", `${session(draft.draft_id)}/commit`, {
        draft_rev: draft.draft_revision,
        evaluation_id: evaluation.evaluation_id,
        idempotency_key: opts?.idempotency_key ?? newKey(),
      });
      if (!r.ok) return failed(r.code ? `${r.code}: ${r.message}` : r.message);
      return acknowledged({ committed_at_utc: r.data.at_utc });
    },

    submitScreenFrame: async () => failed(notAvailable("Screen sharing")),
    submitReviewMark: async () => failed(notAvailable("Review marks")),

    async revokeEntry(entryId, revisionId) {
      const r = await request<Ws6KnowledgeEntry>("POST", `/api/knowledge/entries/${enc(entryId)}/revoke`, {
        reason: "Removed by the expert from the web app",
      });
      // WS6 revokes the entry; the UI keys its state by the revision it asked about.
      return r.ok ? acknowledged({ entry_id: entryId, revision_id: revisionId }) : failed(r.message);
    },

    async deleteEvidence(sid, eventId) {
      const r = await request<unknown>("DELETE", `${session(sid)}/events/${enc(eventId)}`);
      // WS6's cascade summary only promises `deleted`; revoked entries arrive as entry.revoked events.
      return r.ok ? acknowledged({ event_id: eventId, revoked_entry_ids: [] }) : failed(r.message);
    },

    subscribe(sid, onUpdate) {
      const Ctor: EventSourceCtor | undefined =
        options.EventSource ?? (typeof EventSource === "undefined" ? undefined : EventSource);
      if (!Ctor) {
        onUpdate({ type: "connection", state: "disconnected" });
        return () => {};
      }
      let active = true;
      let lastSeq = 0;
      const es = new Ctor(`${baseUrl}${session(sid)}/stream`);
      openSubscriptions++;
      const emit = (u: SourceUpdate) => {
        if (active) onUpdate(u);
      };
      const setConnection = (state: ConnectionState) => {
        if (!active) return;
        backend = state;
        emit({ type: "connection", state });
      };
      // Failed re-fetches are dropped: the next event or a resync after reconnect recovers.
      const refetch = <T>(load: () => Promise<T>, toUpdate: (v: T) => SourceUpdate) =>
        load().then(v => emit(toUpdate(v)), () => {});

      const onBusEvent = (message: MessageEvent) => {
        const e = parseBusEvent(message.data);
        // Named events and onmessage could both deliver; seq is monotonic per session.
        if (!active || !e || e.seq <= lastSeq) return;
        lastSeq = e.seq;
        if (SESSION_TYPES.includes(e.type)) refetch(() => readSession(sid), s => ({ type: "session", session: s }));
        if (e.type === "event.stored") {
          const eid = idOf(e, "event_id");
          if (eid) refetch(() => readEvent(sid, eid), ev => ({ type: "pointing_event", event: ev }));
        }
        if (e.type === "entry.revoked") {
          const entry_id = idOf(e, "entry_id");
          const revision_id = idOf(e, "revision_id");
          if (entry_id && revision_id) emit({ type: "knowledge", entry_id, revision_id, status: "revoked" });
        }
        if (WORKMAP_TYPES.includes(e.type)) refetch(() => readWorkMap(sid), w => ({ type: "workmap", workmap: w }));
      };

      // EventSource reconnects by itself and sends Last-Event-ID, so WS6 replays what was missed.
      es.addEventListener("open", () => setConnection("connected"));
      es.addEventListener("error", () =>
        setConnection(es.readyState === EVENT_SOURCE_CLOSED ? "disconnected" : "reconnecting")
      );
      es.addEventListener("message", onBusEvent);
      for (const type of BUS_TYPES) es.addEventListener(type, onBusEvent);

      return () => {
        if (!active) return;
        active = false;
        es.close();
        openSubscriptions--;
        if (openSubscriptions === 0) backend = "unknown";
      };
    },
  };
}
