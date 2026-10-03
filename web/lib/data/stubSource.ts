// Test helper: a DataSource whose pushes and action results the test controls.
// Not imported by app code.
import type { Ack, DataSource, SourceUpdate } from "@/lib/data/source";
import type { ReviewMark, ReviewView, WorkMapView } from "@/lib/ui/contracts";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

const unused = () => Promise.reject(new Error("not used in this test"));

export function createStubSource(init: { workmap?: WorkMapView; review?: ReviewView }) {
  const listeners = new Set<(u: SourceUpdate) => void>();
  const marks: { mark: ReviewMark; result: Deferred<Ack<{ received_at_utc: string }>> }[] = [];

  const source: DataSource = {
    kind: "fixture",
    getSession: unused,
    getWorkMap: () => (init.workmap ? Promise.resolve(structuredClone(init.workmap)) : unused()),
    getPracticeCase: unused,
    getAssessment: unused,
    getReview: () => (init.review ? Promise.resolve(structuredClone(init.review)) : unused()),
    requestOffRecord: unused,
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
    listenerCount: () => listeners.size,
  };
}
