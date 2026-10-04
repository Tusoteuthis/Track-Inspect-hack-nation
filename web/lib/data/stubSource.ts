// Test helper: a DataSource whose pushes and action results the test controls.
// Not imported by app code.
import type { PointingEvent } from "@/lib/expert/contracts";
import type { Ack, DataSource, DeleteEvidenceResult, RevokeResult, SourceUpdate } from "@/lib/data/source";
import type {
  AssessmentView,
  CaseSummary,
  PracticeCaseView,
  ReviewMark,
  ReviewView,
  SessionView,
  WorkMapView,
} from "@/lib/ui/contracts";

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

/** One revoke/delete awaiting the test's decision. */
export type TrustRequest =
  | { kind: "revoke"; entry_id: string; revision_id: string; result: Deferred<Ack<RevokeResult>> }
  | { kind: "delete"; session_id: string; event_id: string; result: Deferred<Ack<DeleteEvidenceResult>> };

export function createStubSource(init: {
  workmap?: WorkMapView;
  review?: ReviewView;
  session?: SessionView;
  events?: PointingEvent[];
  cases?: CaseSummary[];
  assessment?: AssessmentView;
  practiceCase?: PracticeCaseView;
  /** Every read rejects with this message (route error-state tests). */
  rejectAll?: string;
}) {
  const listeners = new Set<(u: SourceUpdate) => void>();
  const marks: { mark: ReviewMark; result: Deferred<Ack<{ received_at_utc: string }>> }[] = [];
  const requests: SessionRequest[] = [];
  const trust: TrustRequest[] = [];
  // Tests change these to simulate what a resync after reconnect reads.
  const state = { session: init.session ?? null, events: init.events ?? [] };

  const read = <T,>(value: T | null | undefined): Promise<T> =>
    init.rejectAll
      ? Promise.reject(new Error(init.rejectAll))
      : value !== null && value !== undefined
        ? Promise.resolve(structuredClone(value))
        : unused();

  const request = (kind: SessionRequest["kind"], value?: boolean) => {
    const result = deferred<Ack<SessionView>>();
    requests.push({ kind, value, result });
    return result.promise;
  };

  const source: DataSource = {
    kind: "fixture",
    getSession: () => read(state.session),
    getWorkMap: () => read(init.workmap),
    getPracticeCase: () => read(init.practiceCase),
    getAssessment: () => read(init.assessment),
    getReview: () => read(init.review),
    listCases: () => read(init.cases),
    startSession: () => request("start"),
    requestOffRecord: (_sid, offRecord) => request("off_record", offRecord),
    requestPause: (_sid, paused) => request("pause", paused),
    requestStop: () => request("stop"),
    getRecentEvents: () => (init.rejectAll ? Promise.reject(new Error(init.rejectAll)) : Promise.resolve(structuredClone(state.events))),
    submitDraftForReview: unused,
    commitDraft: unused,
    submitScreenFrame: unused,
    submitReviewMark: mark => {
      const result = deferred<Ack<{ received_at_utc: string }>>();
      marks.push({ mark, result });
      return result.promise;
    },
    revokeEntry: (entry_id, revision_id) => {
      const result = deferred<Ack<RevokeResult>>();
      trust.push({ kind: "revoke", entry_id, revision_id, result });
      return result.promise;
    },
    deleteEvidence: (session_id, event_id) => {
      const result = deferred<Ack<DeleteEvidenceResult>>();
      trust.push({ kind: "delete", session_id, event_id, result });
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
    trust,
    state,
    listenerCount: () => listeners.size,
  };
}
