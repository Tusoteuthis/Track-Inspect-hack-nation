// Types for the tutor evaluation (Sprint 3). The evaluator judges a learner's draft decision
// + reason on an unseen case against pinned, eligible expert knowledge only. Outcomes are
// WS5-defined; WS6 maps them to commit consequences (outcome-policy.json).

import type { EligibilityContext, KnowledgeCandidate } from "./eligibility";
import type { EntryKind } from "./schema";

export const TUTOR_EVALUATOR = { id: "ws5-tutor", version: "0.3.0" } as const;

export type EvaluationOutcome = "ok" | "intervene" | "uncertain";
export const EVALUATION_OUTCOMES: readonly EvaluationOutcome[] = ["ok", "intervene", "uncertain"];

/** The generic newcomer task: a draft decision plus a reason (opaque strings, no categories). */
export type LearnerDraftInput = {
  draft_rev: number;
  decision: string;
  reason: string;
  /** What the learner is pointing at or looking at, as text. Null when not given. */
  visual_context: string | null;
};

/**
 * The learner-visible view of a case (WS4 "visible context"). Evaluator-only material is never
 * part of it; `assertLearnerCaseView` rejects inputs that carry evaluator fields.
 */
export type LearnerCaseView = {
  case_id: string;
  title: string | null;
  /** Facts the learner is allowed to see on the trace, as written by WS4. */
  visible_context: string[];
  source: "live" | "fixture" | "stub";
};

/** Pinned knowledge plus the context to re-check it. Every candidate must pass `isTeachable`. */
export type EvaluationKnowledge = {
  candidates: readonly KnowledgeCandidate[];
  ctx: EligibilityContext;
};

export type EvaluateInput = {
  draft: LearnerDraftInput;
  case_view: LearnerCaseView;
  knowledge: EvaluationKnowledge;
};

/** One citation of the expert's own words. `quote` is verbatim in that revision's expert words. */
export type Citation = {
  entry_id: string;
  revision_id: string;
  exchange_ids: string[];
  quote: string;
};

export type EvidencePointer = { entry_id: string; event_id: string; highlighted_image_ref: string; image_ref: string };

export type TutorEvaluation = {
  outcome: EvaluationOutcome;
  cited: Citation[];
  /** Guiding question first, then the expert's reasoning with quotes and evidence pointers. */
  feedback_text: string;
  guiding_question: string;
  uncertainty: string | null;
  /** Set only when a pinned, confirmed escalation rule applies. */
  escalation: { entry_id: string; revision_id: string } | null;
  evidence: EvidencePointer[];
  /** What the deterministic guards changed, for audit (empty when the judge's verdict stood). */
  guard_notes: string[];
  produced_by: { module: string; version: string; judge: string };
};

// --- judge ---------------------------------------------------------------------

/** One knowledge entry as the judge sees it: expert words verbatim, AI synthesis labelled. */
export type JudgeKnowledgeItem = {
  entry_id: string;
  kind: EntryKind;
  /** AI process wording, never the expert's words. */
  process_summary: string | null;
  /** Verbatim expert quotes — the only text the judge may quote. */
  expert_quotes: string[];
  /** Exception rules as "when <trigger> → <action>" built from the entry's statements. */
  exceptions: string[];
  qualifiers: string[];
};

/** Everything the judge sees. Deliberately no case id, case title, file path or other cases. */
export type JudgeInput = {
  draft: { decision: string; reason: string; visual_context: string | null };
  visible_case: string[];
  knowledge: JudgeKnowledgeItem[];
};

export type JudgeVerdict = {
  outcome: EvaluationOutcome;
  citations: { entry_id: string; quote: string }[];
  guiding_question: string;
  /** Explanation in the tutor's words; may quote only text that is also cited. */
  explanation: string;
  /** Why the knowledge does not settle the case, when outcome is uncertain. */
  uncertainty: string | null;
  /** entry_id of a confirmed escalation rule that applies, if any. */
  escalation_entry_id: string | null;
  /** What context the learner (or a senior) should supply, when nothing covers the case. */
  missing_context: string | null;
};

export type Judge = {
  /** e.g. "anthropic:claude-opus-5-5" or "mock". */
  name: string;
  judge(input: JudgeInput): Promise<JudgeVerdict>;
};

export class JudgeError extends Error {
  constructor(message: string, readonly cause_detail?: unknown) {
    super(message);
    this.name = "JudgeError";
  }
}
