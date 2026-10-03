// The single data-access interface for every WS7 screen (no second backend).
// fixtureSource implements it now; apiSource (WS6) replaces it later.
import type {
  AssessmentView,
  LearnerDraft,
  LearnerEvaluation,
  PracticeCaseView,
  ReviewMark,
  ReviewView,
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
  | { type: "workmap"; workmap: WorkMapView }
  | { type: "review"; review: ReviewView };

export interface DataSource {
  readonly kind: "fixture" | "api";
  getSession(sessionId: string): Promise<SessionView>;
  getWorkMap(sessionId: string): Promise<WorkMapView>;
  getPracticeCase(caseId: string): Promise<PracticeCaseView>;
  getAssessment(sessionId: string): Promise<AssessmentView>;
  getReview(sessionId: string): Promise<ReviewView>;
  requestOffRecord(sessionId: string, offRecord: boolean): Promise<Ack<SessionView>>;
  submitDraftForReview(draft: LearnerDraft): Promise<Ack<LearnerEvaluation>>;
  commitDraft(
    draft: LearnerDraft,
    evaluation: LearnerEvaluation
  ): Promise<Ack<{ committed_at_utc: string }>>;
  /** Acknowledged = received; it does not mean anything was corrected. */
  submitReviewMark(mark: ReviewMark): Promise<Ack<{ received_at_utc: string }>>;
  /** Returns an unsubscribe function. */
  subscribe(sessionId: string, onUpdate: (update: SourceUpdate) => void): () => void;
}
