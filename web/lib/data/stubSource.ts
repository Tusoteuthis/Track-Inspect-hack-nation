// Test helper: a DataSource whose pushes and action results the test controls.
// Not imported by app code.
import type { PointingEvent } from "@/lib/expert/contracts";
import type { Ack, DataSource, SourceUpdate } from "@/lib/data/source";
import type { CaseSummary, ReviewMark, ReviewView, SessionView, WorkMapView } from "@/lib/ui/contracts";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

const unused = () => Promise.reject(new Error("not used in this test"));

/** One session action awaiting the test's decision. */
export type SessionRequest = {
  kind: "start" | "off_record" | "pause" | "stop";
  /** off_record / pause target; undefined for start and stop. */
  value?: boolean;
  result: Deferred<Ack<SessionView>>;
};

export function createStubSource(init: {
  workmap?: WorkMapView;
  review?: ReviewView;
  session?: SessionView;
  events?: PointingEvent[];
  cases?: CaseSummary[];
}) {
  const listeners = new Set<(u: SourceUpdate) => void>();
  const marks: { mark: ReviewMark; result: Deferred<Ack<{ received_at_utc: string }>> }[] = [];
  const requests: SessionRequest[] = [];
  // Tests change these to simulate what a resync after reconnect reads.
  const state = { session: init.session ?? null, events: init.events ?? [] };

  const request = (kind: SessionRequest["kind"], value?: boolean) => {
    const result = deferred<Ack<SessionView>>();
    requests.push({ kind, value, result });
    return result.promise;
  };

  const source: DataSource = {
    kind: "fixture",
    getSession: () => (state.session ? Promise.resolve(structuredClone(state.session)) : unused()),
    getWorkMap: () => (init.workmap ? Promise.resolve(structuredClone(init.workmap)) : unused()),
    getPracticeCase: unused,
    getAssessment: unused,
    getReview: () => (init.review ? Promise.resolve(structuredClone(init.review)) : unused()),
    listCases: () => (init.cases ? Promise.resolve(structuredClone(init.cases)) : unused()),
    startSession: () => request("start"),
    requestOffRecord: (_sid, offRecord) => request("off_record", offRecord),
    requestPause: (_sid, paused) => request("pause", paused),
    requestStop: () => request("stop"),
    getRecentEvents: () => Promise.resolve(structuredClone(state.events)),
    submitDraftForReview: unused,
    commitDraft: unused,
    submitScreenFrame: unused,
    submitReviewMark: mark => {
      const result = deferred<Ack<{ received_at_utc: string }>>();
      marks.push({ mark, result });
      return result.promise;
    },
    subscribe: (_sessionId, onUpdate) => {
      listeners.add(onUpdate);
      return () => {
        listeners.delete(onUpdate);
      };
    },
  };

  return {
    source,
    push: (u: SourceUpdate) => listeners.forEach(l => l(structuredClone(u))),
    marks,
    requests,
    state,
    listenerCount: () => listeners.size,
  };
}
