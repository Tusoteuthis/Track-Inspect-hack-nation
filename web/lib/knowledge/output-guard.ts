// Deterministic guard on the judge's verdict. The judge may be wrong; these rules make sure
// nothing it says reaches the learner unless it is backed by pinned expert words:
// - every citation references a revision the judge was shown (pinned + retrieved);
// - every quote is verbatim in that revision's expert words AND in the linked answer line;
// - ok / intervene without a valid citation become uncertain;
// - no quoted text in the tutor's wording unless it is part of a valid citation;
// - an escalation must be a pinned, confirmed escalation rule; uncertain never invents a rule.

import type { ExpertExchange } from "@/lib/expert/contracts";
import { EVALUATION_OUTCOMES, JudgeError, type Citation, type EvaluationOutcome, type JudgeVerdict } from "./evaluation-types";
import { collectQuotes, type KnowledgeEntryContent } from "./schema";

/** Below this many words a "quote" carries no reasoning and is too easy to match by accident. */
export const MIN_QUOTE_WORDS = 3;

export const FALLBACK_QUESTION =
  "Before saving, what do you see on this trace that supports your decision, and is there anything the expert told us to check first?";
export const FALLBACK_EXPLANATION = "Here is what the expert said that applies to this draft.";
export const DEFAULT_MISSING_CONTEXT =
  "The confirmed expert knowledge does not cover this case. Please describe what else you can see, or ask a senior engineer before saving.";

export type GuardedVerdict = {
  outcome: EvaluationOutcome;
  cited: Citation[];
  guiding_question: string;
  explanation: string;
  uncertainty: string | null;
  missing_context: string | null;
  escalation: { entry_id: string; revision_id: string } | null;
  notes: string[];
};

// "…", “…” and «…» spans. Single quotes are left alone: they collide with apostrophes.
const QUOTED_SPAN = /"([^"]+)"|“([^”]+)”|«([^»]+)»/g;

export function quotedSpans(text: string): string[] {
  return [...text.matchAll(QUOTED_SPAN)].map(m => (m[1] ?? m[2] ?? m[3]).trim()).filter(Boolean);
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Resolves a quote against one revision: it must be a substring of one of the revision's
 * quotes, and that span must be verbatim in an answer line of the same exchange.
 * Returns the supporting exchange ids (empty = not verbatim).
 */
export function verbatimExchangeIds(entry: KnowledgeEntryContent, quote: string, exchanges: readonly ExpertExchange[]): string[] {
  const byId = new Map(exchanges.map(x => [x.exchange_id, x]));
  const ids = new Set<string>();
  for (const q of collectQuotes(entry)) {
    if (!q.quote.includes(quote)) continue;
    const lines = byId.get(q.exchange_id)?.answer_lines ?? [];
    if (lines.some(l => l.text.includes(quote))) ids.add(q.exchange_id);
  }
  return [...ids].sort();
}

/** True when every quoted span in `text` is part of one of the cited quotes. */
export function onlyCitedQuotes(text: string, cited: readonly Citation[]): boolean {
  return quotedSpans(text).every(span => cited.some(c => c.quote.includes(span)));
}

export function guardVerdict(
  verdict: JudgeVerdict,
  shown: readonly KnowledgeEntryContent[],
  exchanges: readonly ExpertExchange[]
): GuardedVerdict {
  if (!EVALUATION_OUTCOMES.includes(verdict.outcome)) {
    throw new JudgeError(`judge returned an unknown outcome "${String(verdict.outcome)}"`);
  }
  const notes: string[] = [];
  const byEntry = new Map(shown.map(e => [e.entry_id, e]));
  let outcome = verdict.outcome;

  // Citations.
  const cited: Citation[] = [];
  for (const c of verdict.citations) {
    const entry = byEntry.get(c.entry_id);
    if (!entry) {
      notes.push(`dropped citation of ${c.entry_id}: not in the pinned knowledge shown to the judge`);
      continue;
    }
    const quote = c.quote.trim();
    if (wordCount(quote) < MIN_QUOTE_WORDS) {
      notes.push(`dropped citation of ${c.entry_id}: quote shorter than ${MIN_QUOTE_WORDS} words`);
      continue;
    }
    const exchange_ids = verbatimExchangeIds(entry, quote, exchanges);
    if (!exchange_ids.length) {
      notes.push(`dropped citation of ${c.entry_id}: quote is not verbatim in ${entry.revision_id}'s expert words`);
      continue;
    }
    if (cited.some(x => x.entry_id === entry.entry_id && x.quote === quote)) continue;
    cited.push({ entry_id: entry.entry_id, revision_id: entry.revision_id, exchange_ids, quote });
  }

  // Escalation: only a pinned, confirmed escalation rule, and only for uncertain.
  let escalation: GuardedVerdict["escalation"] = null;
  if (verdict.escalation_entry_id) {
    const e = byEntry.get(verdict.escalation_entry_id);
    if (!e || e.kind !== "escalation") {
      notes.push(`dropped escalation ${verdict.escalation_entry_id}: not a pinned escalation rule`);
    } else if (outcome !== "uncertain") {
      notes.push(`dropped escalation ${e.entry_id}: escalation applies only to an uncertain outcome`);
    } else {
      escalation = { entry_id: e.entry_id, revision_id: e.revision_id };
      // The learner hears the rule in the expert's own words.
      if (!cited.some(c => c.entry_id === e.entry_id)) {
        const q = e.expert_words[0];
        const exchange_ids = verbatimExchangeIds(e, q.quote, exchanges);
        if (exchange_ids.length) cited.push({ entry_id: e.entry_id, revision_id: e.revision_id, exchange_ids, quote: q.quote });
      }
    }
  }

  if ((outcome === "intervene" || outcome === "ok") && !cited.length) {
    notes.push(`downgraded ${outcome} to uncertain: no valid citation of pinned expert words`);
    outcome = "uncertain";
    escalation = null;
  }

  // Tutor wording: no uncited quotes.
  let guiding_question = verdict.guiding_question.trim();
  if (!guiding_question || !onlyCitedQuotes(guiding_question, cited)) {
    notes.push(guiding_question ? "replaced guiding question: it quoted uncited text" : "added a guiding question");
    guiding_question = FALLBACK_QUESTION;
  }
  let explanation = verdict.explanation.trim();
  if (!onlyCitedQuotes(explanation, cited)) {
    notes.push("replaced explanation: it quoted uncited text");
    explanation = FALLBACK_EXPLANATION;
  }
  const clean = (s: string | null, label: string): string | null => {
    const t = s?.trim() ?? "";
    if (!t) return null;
    if (onlyCitedQuotes(t, cited)) return t;
    notes.push(`removed ${label}: it quoted uncited text`);
    return null;
  };
  let uncertainty = outcome === "uncertain" ? clean(verdict.uncertainty, "uncertainty") : null;
  let missing_context = outcome === "uncertain" ? clean(verdict.missing_context, "missing_context") : null;

  if (outcome === "uncertain") {
    if (!escalation && !missing_context) {
      notes.push("added a request for missing context: uncertain without a confirmed escalation rule");
      missing_context = DEFAULT_MISSING_CONTEXT;
    }
    uncertainty ??= escalation
      ? "The expert gave a confirmed rule for cases like this: escalate."
      : "The confirmed expert knowledge does not settle this case.";
  }

  return { outcome, cited, guiding_question, explanation, uncertainty, missing_context, escalation, notes };
}
