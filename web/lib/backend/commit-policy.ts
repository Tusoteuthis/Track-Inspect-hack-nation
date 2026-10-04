/**
 * The pre-save commit guard as a pure function. WS5 defines evaluation outcomes; the outcome
 * policy (`outcome-policy.json`, pending WS5 agreement) maps each one to a consequence, and this
 * function only enforces it. The commit route re-reads state from disk under the session lock and
 * calls it; nothing else decides whether a learner draft may be saved.
 */
import { z } from "zod";
import type { Evaluation, LearnerDraft } from "@/lib/contracts";
import policyJson from "./outcome-policy.json";

export const ConsequenceSchema = z.enum(["allow", "block", "allow_with_escalation"]);
export type Consequence = z.output<typeof ConsequenceSchema>;

export const OutcomePolicySchema = z.object({
  status: z.string().optional(),
  note: z.string().optional(),
  outcomes: z.record(z.string(), ConsequenceSchema),
});
export type OutcomePolicy = z.output<typeof OutcomePolicySchema>;

export function loadOutcomePolicy(): OutcomePolicy {
  return OutcomePolicySchema.parse(policyJson);
}

export const DEFAULT_OUTCOME_POLICY: OutcomePolicy = loadOutcomePolicy();

export type CommitState = {
  /** The session's current draft (null if the learner never saved one). */
  draft: LearnerDraft | null;
  /** The evaluation the commit request names, if it belongs to this session. */
  latestEvaluation: Evaluation | null;
  /** `draft_rev` the commit request names. */
  requestDraftRev: number;
  /** The session's pinned revision IDs now. */
  pinnedRevisionIds: readonly string[];
  /** Every pinned revision is still its entry's current, confirmed (non-revoked) revision. */
  pinnedKnowledgeCurrent: boolean;
  committed: boolean;
  /** The learner chose "save and escalate". */
  escalated: boolean;
};

export type CommitPolicyCode =
  | "evaluation_required"
  | "evaluation_pending"
  | "evaluation_stale"
  | "knowledge_changed"
  | "blocked_by_outcome"
  | "already_committed";

export type CommitDecision =
  | { ok: true; escalated: boolean }
  | { ok: false; code: CommitPolicyCode; details?: Record<string, unknown> };

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

export function canCommit(state: CommitState, policy: OutcomePolicy): CommitDecision {
  const { draft, latestEvaluation: e } = state;
  if (state.committed) return { ok: false, code: "already_committed" };
  if (!draft) return { ok: false, code: "evaluation_required", details: { reason: "no_draft" } };
  if (!e) return { ok: false, code: "evaluation_required", details: { reason: "no_evaluation" } };
  const ref = { evaluation_id: e.evaluation_id };
  if (e.status === "failed") return { ok: false, code: "evaluation_required", details: { ...ref, reason: "evaluation_failed" } };
  if (e.status === "pending") return { ok: false, code: "evaluation_pending", details: ref };

  if (e.status === "stale" && e.stale_reason === "knowledge_changed") {
    return { ok: false, code: "knowledge_changed", details: ref };
  }
  if (e.status === "stale" || e.draft_rev !== draft.draft_rev || state.requestDraftRev !== draft.draft_rev) {
    return {
      ok: false,
      code: "evaluation_stale",
      details: { ...ref, evaluation_draft_rev: e.draft_rev, current_draft_rev: draft.draft_rev, request_draft_rev: state.requestDraftRev },
    };
  }
  if (!state.pinnedKnowledgeCurrent || !sameSet(e.knowledge_revision_ids, state.pinnedRevisionIds)) {
    return { ok: false, code: "knowledge_changed", details: ref };
  }

  const outcome = e.outcome;
  const consequence: Consequence = outcome !== null ? (policy.outcomes[outcome] ?? "block") : "block";
  if (consequence === "block") return { ok: false, code: "blocked_by_outcome", details: { outcome, consequence, ...ref } };
  if (consequence === "allow_with_escalation") {
    if (!state.escalated) return { ok: false, code: "blocked_by_outcome", details: { outcome, consequence, requires: "escalated", ...ref } };
    return { ok: true, escalated: true };
  }
  return { ok: true, escalated: false };
}
