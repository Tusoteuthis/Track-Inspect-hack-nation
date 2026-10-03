// Scripted fixture debrief: Revision 1 → expert correction → Revision 2 →
// confirmed. Each stage is explicit JSON in web/fixtures/ui/ (no patch logic),
// so the update path can be exercised without WS3/WS6. State is per instance,
// i.e. per browser tab for the shared fixtureSource; a reload resets it.
import reviewScript from "@/fixtures/ui/review-script.json";
import rev1 from "@/fixtures/ui/workmap.json";
import rev2 from "@/fixtures/ui/workmap-rev-2.json";
import rev2Confirmed from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { acknowledged, failed, type Ack, type SourceUpdate } from "@/lib/data/source";
import type { ExpertConfirmation, OpenQuestion } from "@/lib/expert/contracts";
import type { ReviewMark, ReviewView, WorkMapView } from "@/lib/ui/contracts";

// JSON imports widen literal unions (e.g. "fixture") to string, hence the casts.
const REVISIONS: Record<string, WorkMapView> = {
  "rev-1": rev1 as WorkMapView,
  "rev-2": rev2 as WorkMapView,
  "rev-2-confirmed": rev2Confirmed as WorkMapView,
};

type Stage = {
  label: string;
  current: string;
  previous: string | null;
  open_questions: OpenQuestion[];
  confirmations: ExpertConfirmation[];
};

const SESSION_ID = reviewScript.session_id;
const STAGES = reviewScript.stages as Stage[];

function viewOf(stage: Stage): ReviewView {
  return structuredClone({
    session_id: SESSION_ID,
    current: REVISIONS[stage.current],
    previous: stage.previous ? REVISIONS[stage.previous] : null,
    open_questions: stage.open_questions,
    confirmations: stage.confirmations,
    source: "fixture",
  });
}

export type ReviewScriptControls = {
  /** Moves to the next stage and pushes it to subscribers. false at the end. */
  advance(): boolean;
  reset(): void;
  stageIndex(): number;
  readonly stageLabels: readonly string[];
  setFailMarks(fail: boolean): void;
  failMarks(): boolean;
};

export function createReviewScript({ markLatencyMs = 700 }: { markLatencyMs?: number } = {}) {
  let index = 0;
  let failMarks = false;
  const listeners = new Set<{ sessionId: string; onUpdate: (u: SourceUpdate) => void }>();

  const check = (sessionId: string) => {
    if (sessionId !== SESSION_ID) throw new Error(`Unknown session: ${sessionId}`);
  };
  const emit = () => {
    const review = viewOf(STAGES[index]);
    for (const l of listeners) {
      if (l.sessionId !== SESSION_ID) continue;
      l.onUpdate({ type: "workmap", workmap: structuredClone(review.current) });
      l.onUpdate({ type: "review", review: structuredClone(review) });
    }
  };

  const controls: ReviewScriptControls = {
    advance() {
      if (index >= STAGES.length - 1) return false;
      index += 1;
      emit();
      return true;
    },
    reset() {
      index = 0;
      emit();
    },
    stageIndex: () => index,
    stageLabels: STAGES.map(s => s.label),
    setFailMarks(fail) {
      failMarks = fail;
    },
    failMarks: () => failMarks,
  };

  return {
    controls,
    getWorkMap: async (sessionId: string): Promise<WorkMapView> => {
      check(sessionId);
      return viewOf(STAGES[index]).current;
    },
    getReview: async (sessionId: string): Promise<ReviewView> => {
      check(sessionId);
      return viewOf(STAGES[index]);
    },
    submitReviewMark: (mark: ReviewMark): Promise<Ack<{ received_at_utc: string }>> =>
      new Promise(resolve => {
        setTimeout(() => {
          if (failMarks) return resolve(failed("Simulated failure (fixture): the request was not received."));
          if (mark.session_id !== SESSION_ID) return resolve(failed("Unknown session."));
          if (mark.revision_id !== REVISIONS[STAGES[index].current].revision_id) {
            return resolve(failed("This revision is no longer under review."));
          }
          resolve(acknowledged({ received_at_utc: new Date().toISOString() }));
        }, markLatencyMs);
      }),
    subscribe(sessionId: string, onUpdate: (u: SourceUpdate) => void) {
      const entry = { sessionId, onUpdate };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
  };
}
