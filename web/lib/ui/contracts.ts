// WS7 UI-state contract — v0, pending WS6/WS5 agreement.
// These types describe what screens render. They map *from* WS3/WS5/WS6 records
// and must not redefine those records' meaning. Field names are snake_case to
// match the briefs and the JSON on disk. See notes/ws7-ui-contracts-v0.md.

export const UI_CONTRACT_VERSION = "ws7.ui.v0";

/** Where the data on screen came from. "fixture" must always be visibly labelled. */
export type DataOrigin = "live" | "fixture";

export type ConnectionState = "connected" | "disconnected" | "reconnecting" | "unknown";

/** `*_pending` = requested, not yet acknowledged by the backend/capture side. */
export type RecordingState = "on_record" | "off_record" | "off_record_pending" | "on_record_pending";

export type SessionView = {
  session_id: string;
  role: "expert" | "newcomer";
  lifecycle: "not_started" | "active" | "paused" | "ended";
  recording_state: RecordingState;
  connection: { capture: ConnectionState; agent: ConnectionState; backend: ConnectionState };
  case_id: string | null;
  knowledge_revision_id: string | null;
  source: DataOrigin;
};

export type EvidenceAsset = {
  asset_id: string;
  original_url: string;
  highlighted_url: string | null;
  /** The frame this image shows; region coordinates are only valid on the same frame. */
  frame_id: string;
  width_px: number;
  height_px: number;
};

export type MappingStatus = "resolved" | "ambiguous" | "unresolved";

/** Normalized box on the original saved frame, origin top-left, values in [0, 1]. */
export type EvidenceRegion = {
  frame_id: string;
  coordinate_space: "original_frame_normalized";
  x: number;
  y: number;
  width: number;
  height: number;
  mapping_status: MappingStatus;
};

export type EvidenceRef = {
  event_id: string | null;
  asset: EvidenceAsset;
  region: EvidenceRegion | null;
};

/** Only "confirmed" may ever be presented as verified expert knowledge. */
export type KnowledgeStatus = "draft" | "confirmed" | "unresolved" | "revoked" | "missing";

/** The expert's own words, verbatim. Never synthesized. */
export type ExpertQuote = { exchange_id: string; text: string };

export type WorkMapStep = {
  entry_id: string;
  revision_id: string;
  kind: "step" | "decision" | "guardrail" | "exception";
  title: string;
  /** Apprentice synthesis — always displayed separately from expert_quotes. */
  ai_summary: string | null;
  expert_quotes: ExpertQuote[];
  reasoning: string | null;
  guardrails: string[];
  evidence: EvidenceRef[];
  status: KnowledgeStatus;
  open_question: string | null;
};

export type WorkMapView = {
  session_id: string;
  revision_id: string;
  steps: WorkMapStep[];
  source: DataOrigin;
};

/** Learner-visible case data only — never expected answers or scoring. */
export type PracticeCaseView = {
  case_id: string;
  asset: EvidenceAsset;
  visible_context: string[];
  /** Choice list supplied by the case; null = free-text decision. */
  decision_options: string[] | null;
  knowledge_revision_id: string;
  source: DataOrigin;
};

export type LearnerDraft = {
  draft_id: string;
  draft_revision: number;
  decision: string;
  reason: string;
  region: EvidenceRegion | null;
};

export type Citation = {
  entry_id: string;
  revision_id: string;
  quote: ExpertQuote | null;
  evidence: EvidenceRef | null;
};

export type LearnerEvaluation = {
  /** Backend id, required by the WS6 commit; absent in older fixtures. */
  evaluation_id?: string;
  /** The exact draft and knowledge revisions this evaluation assessed. */
  draft_revision: number;
  knowledge_revision_id: string;
  /** Opaque WS5 outcome; mapped to UI review state in one adapter (Sprint 2). */
  outcome: string;
  message: string;
  guiding_question: string | null;
  citations: Citation[];
};

/** Learner review state on /practice (Sprint 2). Only review_complete permits Save. */
export type ReviewStatus =
  | "editing_unreviewed"
  | "review_pending"
  | "guidance_needed"
  | "review_complete"
  | "saving"
  | "saved"
  | "save_failed";

export type PracticeTimelineEntry = {
  kind: "proposed" | "guidance" | "corrected" | "saved";
  at_utc: string;
  draft_revision: number;
};

/** Acknowledged reference to a still frame of the learner's shared screen. */
export type ScreenFrameRef = {
  frame_id: string;
  captured_at_utc: string;
  draft_revision: number;
  source: DataOrigin;
};

export type AssessmentItem = { description: string; citations: Citation[] };

export type AssessmentView = {
  session_id: string;
  independent: AssessmentItem[];
  assisted: AssessmentItem[];
  unresolved: AssessmentItem[];
  practice_next: string[];
  evidence_used: Citation[];
  source: DataOrigin;
};
