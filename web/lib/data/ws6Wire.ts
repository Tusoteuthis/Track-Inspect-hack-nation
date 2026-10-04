// WS6 wire shapes consumed by apiSource — only the fields WS7 reads.
// Copied from WS6 api-v0 (notes/ws6-api-v0.md, web/lib/contracts/*, branch
// 004-ws6-knowledge-confirmation) on 2026-10-04. Replace with imports from
// `@/lib/contracts` once WS6 merges.
import type { AnswerLine, PointingEvent } from "@/lib/expert/contracts";

export type Ws6Source = "live" | "stub" | "fixture";
export type Ws6RecordState = "on_record" | "off_record";
export type Ws6Lifecycle = "created" | "active" | "ended" | "aborted";
export type Ws6EntryStatus = "draft" | "confirmed" | "unresolved" | "revoked";

export type Ws6KnowledgeRef = { entry_id: string; revision_id: string };

export type Ws6Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinate_space: "original_frame_normalized";
  frame_width_px: number;
  frame_height_px: number;
};

export type Ws6Session = {
  session_id: string;
  role: "expert" | "newcomer";
  lifecycle: Ws6Lifecycle;
  record_state: Ws6RecordState;
  case_id: string | null;
  trace_ref: string | null;
  pinned_knowledge: Ws6KnowledgeRef[] | null;
  source: Ws6Source;
  created_at_utc: string;
  rev: number;
};

/** SSE payload: IDs only, never content. Numeric revs in `ids` are decimal strings. */
export type Ws6BusEvent = {
  seq: number;
  type: string;
  session_id: string;
  ids: Record<string, string | string[]>;
  at_utc: string;
};

/** WS6 returns the WS3 PointingEvent with image refs rewritten to relative `/api/assets/...` URLs. */
export type Ws6PointingEvent = PointingEvent & { asset_id?: string };

// --- WS5 Work Map content (web/lib/knowledge/synthesis-types.ts, schema.ts) ---

export type Ws5EntryKind = "step" | "decision" | "guardrail" | "exception" | "escalation";

export type Ws5Statement =
  | { type: "expert_quote"; exchange_id: string; quote: string }
  | { type: "ai_synthesis"; text: string };

export type Ws5WorkMapExpertWords = { exchange_id: string; question: string | null; quote: string };

/** Subset of WS5 `WorkMapStep` that the UI maps. */
export type Ws5WorkMapStepContent = {
  kind: Ws5EntryKind;
  title: string;
  expert_words: Ws5WorkMapExpertWords[];
  synthesis: { type: "ai_synthesis"; text: string }[];
  guardrails: { trigger: Ws5Statement; action: Ws5Statement; expert_words: Ws5WorkMapExpertWords[] }[];
};

// --- Work Map view (GET /api/workmap) ----------------------------------------

export type Ws6WorkMapEvidence = {
  event_id: string;
  asset_id: string;
  original_url: string;
  highlighted_url: string | null;
  region: Ws6Region;
};

export type Ws6WorkMapExchange = { exchange_id: string; question: string; answer_lines: AnswerLine[] };

export type Ws6WorkMapStep = {
  position: number;
  entry_id: string;
  revision_id: string | null;
  revision_no: number;
  status: Ws6EntryStatus | null;
  is_current: boolean;
  source: Ws6Source | null;
  title: string | null;
  evidence: Ws6WorkMapEvidence[];
  exchanges: Ws6WorkMapExchange[];
  /** WS5 content; typed `unknown` on the wire, so the mapper parses it defensively. */
  content: unknown;
  broken_links: string[];
};

export type Ws6ModuleInfo = { id: string; version: string; source: Ws6Source };

export type Ws6WorkMapView = {
  include: "confirmed" | "draft";
  produced_by: Ws6ModuleInfo | null;
  session_id: string | null;
  job_id: string | null;
  generated_at_utc: string | null;
  steps: Ws6WorkMapStep[];
  excluded: { entry_id: string; revision_id: string | null; reason: string }[];
};

// --- knowledge, learner, assessment ------------------------------------------

export type Ws6KnowledgeEntry = {
  entry_id: string;
  current_revision_id: string;
  current_revision_no: number;
  status: Ws6EntryStatus;
  updated_at_utc: string;
  rev: number;
};

export type Ws6LearnerDraft = {
  session_id: string;
  draft_rev: number;
  decision: string;
  reason: string;
  visual_context: { asset_id: string; region: Ws6Region | null }[];
  updated_at_utc: string;
  source: Ws6Source;
};

export type Ws6EvaluationStatus = "pending" | "done" | "failed" | "stale";

export type Ws6Evaluation = {
  evaluation_id: string;
  session_id: string;
  draft_rev: number;
  knowledge_revision_ids: string[];
  status: Ws6EvaluationStatus;
  outcome: string | null;
  cited: { entry_id: string; revision_id: string; exchange_ids: string[]; quote?: string }[];
  feedback_text: string | null;
  guiding_question?: string | null;
  escalation?: Ws6KnowledgeRef | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export type Ws6Commit = {
  commit_id: string;
  session_id: string;
  draft_rev: number;
  evaluation_id: string;
  at_utc: string;
};

export type Ws5OutcomeClass = "correct_unassisted" | "correct_after_help" | "unresolved_or_escalated";

/** WS5 assessment `content.decisions[]` item. Read defensively: any field may be missing. */
export type Ws5AssessmentDecision = {
  draft_rev_initial: number;
  outcome_class: Ws5OutcomeClass;
  interventions: string[];
  cited_entries: Ws6KnowledgeRef[];
};

/** WS5 assessment `content` (opaque record on the WS6 wire). */
export type Ws5AssessmentContent = {
  decisions: Ws5AssessmentDecision[];
  needed_help_with: string[];
  skills_demonstrated: string[];
  practice_next: string[];
  limitations: string[];
};

export type Ws6Assessment = {
  session_id: string;
  initial_decision: string | null;
  assistance: string[];
  final_outcome: string | null;
  evidence_used: Ws6KnowledgeRef[];
  practice_next: string[];
  source: Ws6Source;
  created_at_utc: string;
  content?: Record<string, unknown>;
};

export type Ws6ApiErrorBody = { error: { code: string; message: string; details?: Record<string, unknown> } };
