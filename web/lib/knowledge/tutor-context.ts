// What the voice tutor is told (Sprint 4, Lane A). Knowledge reaches the ElevenLabs agent only as
// these blocks, sent as silent contextual updates (WS3 capabilities doc, mechanism (a)): one per
// evaluation, carrying the cited, currently eligible expert words and nothing else. No bulk
// knowledge upload, no evaluator notes, no AI explanation that could smuggle in a rule.
// Every citation is re-checked here, so a revocation since the evaluation is never spoken.

import { isTeachable, type EligibilityContext, type KnowledgeCandidate } from "./eligibility";
import type { Citation, EvaluationOutcome, EvidencePointer } from "./evaluation-types";
import { describeScreenContext, type LearnerScreenContext } from "./observation";
import { onlyCitedQuotes, quotedSpans, verbatimExchangeIds } from "./output-guard";
import type { KnowledgeEntryContent } from "./schema";

export type ContextBlock = { text: string; contextId: string };

/** The fields of a TutorEvaluation (or WS6 Evaluation mapped to WS5 ids) that a block may use. */
export type ContextEvaluation = {
  outcome: EvaluationOutcome;
  cited: readonly Citation[];
  guiding_question: string;
  uncertainty: string | null;
  escalation: { entry_id: string; revision_id: string } | null;
  evidence: readonly EvidencePointer[];
};

export class TutorContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorContextError";
  }
}

export type EvaluationBlockInput = {
  evaluation_id: string;
  draft_rev: number;
  evaluation: ContextEvaluation;
  /** The current knowledge state (re-read at delivery time), not the state at evaluation time. */
  knowledge: { candidates: readonly KnowledgeCandidate[]; ctx: EligibilityContext };
  screen: LearnerScreenContext | readonly LearnerScreenContext[] | null;
};

const RULES =
  "rules: ask the guiding question first and let the learner answer; then explain with the expert's words; " +
  "quote only the expert_quote lines, exactly; add no rule, meaning or threshold of your own; do not read this block aloud.";

function teachableEntry(ref: { entry_id: string; revision_id: string }, knowledge: EvaluationBlockInput["knowledge"]): KnowledgeEntryContent {
  const candidate = knowledge.candidates.find(c => c.entry?.entry_id === ref.entry_id && c.entry?.revision_id === ref.revision_id);
  if (!candidate) throw new TutorContextError(`${ref.entry_id}@${ref.revision_id} is not in the knowledge store`);
  const t = isTeachable(candidate, knowledge.ctx);
  if (!t.ok) throw new TutorContextError(`${ref.entry_id}@${ref.revision_id} is not teachable now (${t.reason}: ${t.detail})`);
  return candidate.entry;
}

function checkCitation(c: Citation, knowledge: EvaluationBlockInput["knowledge"]): KnowledgeEntryContent {
  const entry = teachableEntry(c, knowledge);
  const found = verbatimExchangeIds(entry, c.quote, knowledge.ctx.exchanges);
  if (!found.length) throw new TutorContextError(`quote for ${c.entry_id} is not verbatim in the expert's words`);
  if (!c.exchange_ids.length || !c.exchange_ids.every(id => found.includes(id))) {
    throw new TutorContextError(`quote for ${c.entry_id} is not in exchange(s) ${c.exchange_ids.join(", ")}`);
  }
  return entry;
}

function checkScreen(screen: EvaluationBlockInput["screen"], draft_rev: number): void {
  const list = screen === null ? [] : Array.isArray(screen) ? screen : [screen as LearnerScreenContext];
  const stale = list.find(s => s.draft_rev !== draft_rev);
  if (stale) throw new TutorContextError(`screen context is for draft_rev ${stale.draft_rev}, not ${draft_rev}`);
}

const quoteLine = (n: number, c: Citation, entry: KnowledgeEntryContent, evidence: EvidencePointer | undefined) =>
  `expert_quote ${n}: "${c.quote}" (entry ${c.entry_id} ${c.revision_id}, kind ${entry.kind}, exchange ${c.exchange_ids.join(", ")}` +
  (evidence ? `; expert's example image: event ${evidence.event_id}` : "") +
  ")";

/**
 * The block for one evaluation. Throws TutorContextError instead of delivering anything that is
 * not currently eligible, not verbatim, or quotes words that are not cited.
 */
export function buildEvaluationContextBlock(input: EvaluationBlockInput): ContextBlock {
  const { evaluation: ev, knowledge } = input;
  checkScreen(input.screen, input.draft_rev);

  const quotes: { citation: Citation; entry: KnowledgeEntryContent }[] = ev.cited.map(c => ({ citation: c, entry: checkCitation(c, knowledge) }));

  // The escalation rule's own words are delivered even when the evaluation did not cite them.
  let escalationLine = "escalation: none";
  if (ev.escalation) {
    const entry = teachableEntry(ev.escalation, knowledge);
    if (entry.kind !== "escalation") throw new TutorContextError(`${ev.escalation.entry_id} is a ${entry.kind}, not an escalation rule`);
    let n = quotes.findIndex(q => q.citation.entry_id === entry.entry_id) + 1;
    if (!n) {
      const words = entry.expert_words[0];
      if (!words) throw new TutorContextError(`escalation rule ${entry.entry_id} has no expert words`);
      const citation: Citation = { entry_id: entry.entry_id, revision_id: entry.revision_id, exchange_ids: [words.exchange_id], quote: words.quote };
      checkCitation(citation, knowledge);
      quotes.push({ citation, entry });
      n = quotes.length;
    }
    escalationLine = `escalation: follow the expert's escalation rule, expert_quote ${n}, instead of deciding alone`;
  }

  const allCited = quotes.map(q => q.citation);
  for (const [field, text] of [
    ["guiding_question", ev.guiding_question],
    ["uncertainty", ev.uncertainty ?? ""],
  ] as const) {
    if (!onlyCitedQuotes(text, allCited)) throw new TutorContextError(`${field} quotes uncited words: ${quotedSpans(text).join(" | ")}`);
  }

  const lines = [
    `[EVALUATION eid=${input.evaluation_id} draft_rev=${input.draft_rev} outcome=${ev.outcome}]`,
    "Silent context for the tutor: the pre-save review of the learner's current draft.",
  ];
  if (ev.guiding_question) lines.push(`guiding_question: ${ev.guiding_question}`);
  quotes.forEach((q, i) => lines.push(quoteLine(i + 1, q.citation, q.entry, ev.evidence.find(e => e.entry_id === q.citation.entry_id))));
  if (ev.outcome === "uncertain") {
    lines.push(`uncertainty: ${ev.uncertainty ?? "Not covered: the confirmed expert knowledge does not settle this case."}`);
    lines.push(escalationLine);
    if (!ev.escalation) lines.push("If nothing covers it, say so and ask the learner for more context or to check with a senior engineer. Never decide for them.");
  } else if (ev.escalation) {
    lines.push(escalationLine);
  }
  if (ev.outcome === "ok") lines.push("The review found the draft consistent with the expert's words above. Saving is allowed; one correct decision is not proof of independent skill.");
  if (ev.outcome === "intervene") lines.push("Saving is blocked until the learner changes the draft and asks for a new review.");
  lines.push(`learner_screen: ${describeScreenContext(input.screen)}`);
  lines.push(RULES);
  lines.push("[/EVALUATION]");
  return { text: lines.join("\n"), contextId: `ws5-evaluation-${input.evaluation_id}` };
}

/** Orientation at session start. Carries no knowledge text. */
export function buildSessionContextBlock(input: {
  session_id: string;
  pinned_count: number;
  source: "live" | "fixture" | "stub";
  screen: LearnerScreenContext | readonly LearnerScreenContext[] | null;
}): ContextBlock {
  const text = [
    `[SESSION sid=${input.session_id} source=${input.source}]`,
    `The learner is practising on a trace the expert never showed. ${input.pinned_count} confirmed expert entries are pinned for this session; you hear their words only when a review cites them.`,
    `learner_screen: ${describeScreenContext(input.screen)}`,
    "[/SESSION]",
  ].join("\n");
  return { text, contextId: `ws5-session-${input.session_id}` };
}

/** Sent when pinned knowledge is revoked or corrected: earlier quotes of these entries must not be used again. */
export function buildKnowledgeChangedBlock(input: { session_id: string; withdrawn: readonly { entry_id: string; revision_id: string }[] }): ContextBlock {
  const refs = input.withdrawn.map(w => `${w.entry_id} ${w.revision_id}`);
  const text = [
    `[KNOWLEDGE_CHANGED sid=${input.session_id}]`,
    `The expert withdrew or changed: ${refs.join(", ")}. Do not use or repeat anything you were told from these entries.`,
    "Any earlier review that cited them no longer counts; the learner needs a new review before saving.",
    "[/KNOWLEDGE_CHANGED]",
  ].join("\n");
  return { text, contextId: `ws5-knowledge-changed-${input.session_id}-${input.withdrawn.map(w => w.entry_id).join("-")}` };
}
