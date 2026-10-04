// What the judge is allowed to see: the draft, the learner-visible case facts and the retrieved
// eligible entries. No case id, case title, paths, statuses or other cases — so a verdict can
// only come from captured expert knowledge applied to the visible case.

import type { JudgeInput, JudgeKnowledgeItem, LearnerCaseView, LearnerDraftInput } from "./evaluation-types";
import { collectQuotes, type KnowledgeEntryContent, type Statement } from "./schema";

const render = (s: Statement): string => (s.type === "expert_quote" ? `"${s.quote}"` : `[AI wording] ${s.text}`);

export function toJudgeKnowledgeItem(e: KnowledgeEntryContent): JudgeKnowledgeItem {
  const quotes = [...new Set([...e.expert_words.map(q => q.quote), ...collectQuotes(e).map(q => q.quote)])];
  return {
    entry_id: e.entry_id,
    kind: e.kind,
    process_summary: e.workflow_step?.type === "ai_synthesis" ? e.workflow_step.text : null,
    expert_quotes: quotes,
    exceptions: e.exceptions.map(x => `when ${render(x.trigger)} then ${render(x.action)}`),
    qualifiers: [...e.qualifiers],
  };
}

export function buildJudgeInput(
  draft: LearnerDraftInput,
  caseView: LearnerCaseView,
  entries: readonly KnowledgeEntryContent[]
): JudgeInput {
  return {
    draft: { decision: draft.decision, reason: draft.reason, visual_context: draft.visual_context },
    visible_case: [...caseView.visible_context],
    knowledge: entries.map(toJudgeKnowledgeItem),
  };
}
