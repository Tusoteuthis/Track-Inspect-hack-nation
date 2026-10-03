// The single data-access interface for every WS7 screen (no second backend).
// fixtureSource implements it now; apiSource (WS6) replaces it later.
import type {
  AssessmentView,
  LearnerDraft,
  LearnerEvaluation,
  PracticeCaseView,
  ScreenFrameRef,
  SessionView,
  WorkMapView,
} from "@/lib/ui/contracts";

/** Actions resolve with an Ack; the UI shows "done" only for "acknowledged". */
export type Ack<T> = { status: "acknowledged"; value: T } | { status: "failed"; error: string };

export const acknowledged = <T>(value: T): Ack<T> => ({ status: "acknowledged", value });
export const failed = <T = never>(error: string): Ack<T> => ({ status: "failed", error });

/** Live updates pushed by the source. Extended in later sprints (events, revisions). */
export type SourceUpdate =
  | { type: "session"; session: SessionView }
  | { type: "workmap"; workmap: WorkMapView };

export interface DataSource {
  readonly kind: "fixture" | "api";
  getSession(sessionId: string): Promise<SessionView>;
  getWorkMap(sessionId: string): Promise<WorkMapView>;
  getPracticeCase(caseId: string): Promise<PracticeCaseView>;
  getAssessment(sessionId: string): Promise<AssessmentView>;
  requestOffRecord(sessionId: string, offRecord: boolean): Promise<Ack<SessionView>>;
  submitDraftForReview(draft: LearnerDraft): Promise<Ack<LearnerEvaluation>>;
  commitDraft(
    draft: LearnerDraft,
    evaluation: LearnerEvaluation,
    /** One stable key per save intent, so a repeated request commits once. */
    options?: { idempotency_key: string }
  ): Promise<Ack<{ committed_at_utc: string }>>;
  submitScreenFrame(
    caseId: string,
    frame: Blob,
    meta: { draft_revision: number; captured_at_utc: string }
  ): Promise<Ack<ScreenFrameRef>>;
  /** Returns an unsubscribe function. */
  subscribe(sessionId: string, onUpdate: (update: SourceUpdate) => void): () => void;
}
