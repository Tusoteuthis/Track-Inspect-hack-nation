// The single data-access interface for every WS7 screen (no second backend).
// fixtureSource implements it now; apiSource (WS6) replaces it later.
import type { PointingEvent } from "@/lib/expert/contracts";
import type {
  AssessmentView,
  CaseSummary,
  ConnectionState,
  KnowledgeStatus,
  LearnerDraft,
  LearnerEvaluation,
  PracticeCaseView,
  ReviewMark,
  ReviewView,
  ScreenFrameRef,
  SessionView,
  WorkMapView,
} from "@/lib/ui/contracts";

/** Actions resolve with an Ack; the UI shows "done" only for "acknowledged". */
export type Ack<T> = { status: "acknowledged"; value: T } | { status: "failed"; error: string };

export const acknowledged = <T>(value: T): Ack<T> => ({ status: "acknowledged", value });
export const failed = <T = never>(error: string): Ack<T> => ({ status: "failed", error });

/** Live updates pushed by the source. */
export type SourceUpdate =
  | { type: "session"; session: SessionView }
  | { type: "workmap"; workmap: WorkMapView }
  | { type: "review"; review: ReviewView }
  /** A pointing gesture (WS2 → WS3). Displayed only; the UI never forwards it to the agent. */
  | { type: "pointing_event"; event: PointingEvent }
  /** State of the live-update connection itself; "connected" after a drop means: resync. */
  | { type: "connection"; state: ConnectionState }
  /** A knowledge entry changed status (WS6 `entry.revoked`); broadcast to every session. */
  | { type: "knowledge"; entry_id: string; revision_id: string; status: KnowledgeStatus };

/** Acknowledged removal of an entry from teaching. */
export type RevokeResult = { entry_id: string; revision_id: string };
/** Acknowledged evidence deletion and the entries revoked because they cited it. */
export type DeleteEvidenceResult = { event_id: string; revoked_entry_ids: string[] };

export interface DataSource {
  readonly kind: "fixture" | "api";
  getSession(sessionId: string): Promise<SessionView>;
  getWorkMap(sessionId: string): Promise<WorkMapView>;
  getPracticeCase(caseId: string): Promise<PracticeCaseView>;
  getAssessment(sessionId: string): Promise<AssessmentView>;
  getReview(sessionId: string): Promise<ReviewView>;
  /** Cases an expert session can run on (WS4 manifest; learner-safe fields only). */
  listCases(): Promise<CaseSummary[]>;
  startSession(caseId: string): Promise<Ack<SessionView>>;
  requestOffRecord(sessionId: string, offRecord: boolean): Promise<Ack<SessionView>>;
  /** paused=false resumes. Not yet in WS6 (fixture-backed). */
  requestPause(sessionId: string, paused: boolean): Promise<Ack<SessionView>>;
  requestStop(sessionId: string): Promise<Ack<SessionView>>;
  /** Recent pointing events, oldest first; used to resync after a dropped connection. */
  getRecentEvents(sessionId: string): Promise<PointingEvent[]>;
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
  /** Acknowledged = received; it does not mean anything was corrected. */
  submitReviewMark(mark: ReviewMark): Promise<Ack<{ received_at_utc: string }>>;
  /** Removes an entry from teaching. Acknowledged = the backend revoked it. */
  revokeEntry(entryId: string, revisionId: string): Promise<Ack<RevokeResult>>;
  /** Deletes one piece of captured evidence; entries citing it are revoked (WS6 cascade). */
  deleteEvidence(sessionId: string, eventId: string): Promise<Ack<DeleteEvidenceResult>>;
  /** Returns an unsubscribe function. */
  subscribe(sessionId: string, onUpdate: (update: SourceUpdate) => void): () => void;
}
