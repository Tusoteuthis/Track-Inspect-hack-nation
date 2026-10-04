// Tutor evaluation: may this draft be saved? Deterministic guards wrap the judge (D1: an LLM):
//   input guard → retrieve → judge → output guard → feedback.
// The judge never sees case ids, other cases, ineligible knowledge or evaluator material,
// and nothing it says reaches the learner unless it is backed by pinned expert words.

import { assertLearnerCaseView } from "./case-view";
import { selectEligible } from "./eligibility";
import {
  JudgeError,
  TUTOR_EVALUATOR,
  type EvaluateInput,
  type EvidencePointer,
  type Judge,
  type LearnerDraftInput,
  type TutorEvaluation,
} from "./evaluation-types";
import { buildJudgeInput } from "./judge-input";
import { guardVerdict, onlyCitedQuotes, type GuardedVerdict } from "./output-guard";
import { IneligibleKnowledgeError, retrieve } from "./retrieve";
import type { KnowledgeEntryContent } from "./schema";

/** How many entries the judge sees at most (guardrails and escalation rules always included). */
export const RETRIEVAL_LIMIT = 8;

function assertDraft(draft: LearnerDraftInput): void {
  if (!Number.isInteger(draft.draft_rev) || draft.draft_rev < 1) throw new TypeError("draft.draft_rev must be an integer ≥ 1");
  if (typeof draft.decision !== "string" || typeof draft.reason !== "string") {
    throw new TypeError("draft.decision and draft.reason must be strings");
  }
  if (draft.visual_context !== null && typeof draft.visual_context !== "string") {
    throw new TypeError("draft.visual_context must be a string or null");
  }
}

function evidenceFor(entryIds: readonly string[], shown: readonly KnowledgeEntryContent[]): EvidencePointer[] {
  return entryIds.flatMap(id => {
    const v = shown.find(e => e.entry_id === id)?.visual_evidence[0];
    return v ? [{ entry_id: id, event_id: v.event_id, highlighted_image_ref: v.highlighted_image_ref, image_ref: v.image_ref }] : [];
  });
}

/**
 * Pedagogy (brief §7): the guiding question comes first so the learner reasons before the
 * answer; then the expert's own words with a pointer to the evidence image. Cited guardrails
 * are always spelled out — a needed guardrail is never withheld.
 */
export function composeFeedback(g: GuardedVerdict, shown: readonly KnowledgeEntryContent[], evidence: readonly EvidencePointer[]): string {
  const parts = [g.guiding_question];
  if (g.explanation) parts.push(g.explanation);
  for (const c of g.cited) {
    const entry = shown.find(e => e.entry_id === c.entry_id);
    const ev = evidence.find(p => p.entry_id === c.entry_id);
    const label = entry?.kind === "guardrail" ? "Guardrail — the expert said" : "The expert said";
    parts.push(
      `${label}: "${c.quote}" (${c.entry_id} ${c.revision_id}, exchange ${c.exchange_ids.join(", ")})` +
        (ev ? `\nSee the expert's example: event ${ev.event_id}, ${ev.highlighted_image_ref}` : "")
    );
  }
  if (g.outcome === "uncertain") {
    if (g.uncertainty) parts.push(g.uncertainty);
    if (g.escalation) parts.push(`Follow the expert's escalation rule (${g.escalation.entry_id}) instead of deciding alone.`);
    if (g.missing_context) parts.push(g.missing_context);
  }
  return parts.join("\n\n");
}

export async function evaluate(input: EvaluateInput, judge: Judge): Promise<TutorEvaluation> {
  // Input guard.
  const caseView = assertLearnerCaseView(input.case_view);
  assertDraft(input.draft);
  const { pinned, excluded } = selectEligible(input.knowledge.candidates, input.knowledge.ctx);
  if (excluded.length) {
    throw new IneligibleKnowledgeError(
      excluded.map(x => ({ entry_id: String(x.entry_id), revision_id: String(x.revision_id), reason: x.reason }))
    );
  }

  // Retrieve.
  const hits = retrieve({
    knowledge: pinned,
    query: {
      decision: input.draft.decision,
      reason: input.draft.reason,
      visual_context: input.draft.visual_context,
      case_observations: caseView.visible_context,
    },
    limit: RETRIEVAL_LIMIT,
    ctx: input.knowledge.ctx,
  });
  const shown = hits.map(h => pinned.find(e => e.entry_id === h.entry_id && e.revision_id === h.revision_id)!);

  const produced_by = { module: TUTOR_EVALUATOR.id, version: TUTOR_EVALUATOR.version, judge: judge.name };

  // Nothing relevant and no rule to fall back on: there is nothing to judge with.
  if (!shown.length) {
    const g = guardVerdict(
      {
        outcome: "uncertain",
        citations: [],
        guiding_question: "",
        explanation: "",
        uncertainty: "No confirmed expert knowledge applies to this draft yet.",
        escalation_entry_id: null,
        missing_context: null,
      },
      shown,
      input.knowledge.ctx.exchanges
    );
    return finish(g, shown, [...g.notes, "no eligible knowledge retrieved; judge not called"], produced_by);
  }

  // Judge.
  let verdict;
  try {
    verdict = await judge.judge(buildJudgeInput(input.draft, caseView, shown));
  } catch (err) {
    throw err instanceof JudgeError ? err : new JudgeError(`judge ${judge.name} failed: ${(err as Error)?.message ?? err}`, err);
  }

  // Output guard.
  const g = guardVerdict(verdict, shown, input.knowledge.ctx.exchanges);
  return finish(g, shown, g.notes, produced_by);
}

function finish(
  g: GuardedVerdict,
  shown: readonly KnowledgeEntryContent[],
  notes: string[],
  produced_by: TutorEvaluation["produced_by"]
): TutorEvaluation {
  const evidence = evidenceFor([...new Set(g.cited.map(c => c.entry_id))], shown);
  const feedback_text = composeFeedback(g, shown, evidence);
  // Belt and braces: the composed text quotes nothing but valid citations.
  if (!onlyCitedQuotes(feedback_text, g.cited)) throw new JudgeError("composed feedback contains an uncited quote");
  return {
    outcome: g.outcome,
    cited: g.cited,
    feedback_text,
    guiding_question: g.guiding_question,
    uncertainty: g.uncertainty,
    escalation: g.escalation,
    evidence,
    guard_notes: notes,
    produced_by,
  };
}
