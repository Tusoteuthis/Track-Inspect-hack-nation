// The learning assessment of one newcomer session (brief §9, Sprint 4 Lane C). It reports what
// happened per decision: correct without help, correct after help, or unresolved/escalated; the
// interventions and the expert entries they cited; and what to practise next. It never claims
// mastery: one coached correction shows useful assistance, not independent skill.
// Pure. WS6 calls it on commit/end (via adapters/ws6-assessment-module.ts) and persists the result
// under knowledge/assessments/, which is never eligible as knowledge (see eligibility.ts).

import type { Citation } from "./evaluation-types";
import { collectQuotes, type EntryKind, type KnowledgeEntryContent } from "./schema";
import type { TimelineCommit, TimelineEntry } from "./timeline";

export const ASSESSMENT_MODULE = { module: "ws5-assessment", version: "0.4.0" } as const;

export const MASTERY_DISCLAIMER = "One coached correction is not proof of independent mastery.";

export type OutcomeClass = "correct_unassisted" | "correct_after_help" | "unresolved_or_escalated";
export type EntryRef = { entry_id: string; revision_id: string };

/** The fields of a WS6 Evaluation we read (ids already mapped to WS5 entry revisions). */
export type AssessmentEvaluation = {
  evaluation_id: string;
  draft_rev: number;
  status: "pending" | "done" | "failed" | "stale";
  outcome: string | null;
  cited: readonly Citation[];
  escalation: EntryRef | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export type AssessmentCommit = TimelineCommit & { escalated?: boolean };

/** The learner's own draft text (shown in the record as theirs, never as knowledge). */
export type AssessmentDraft = { draft_rev: number; decision: string; reason: string; updated_at_utc: string };

export type AssessmentInput = {
  session_id: string;
  /** buildTimeline(drafts, evaluations, commits, deliveries). */
  timeline: readonly TimelineEntry[];
  evaluations: readonly AssessmentEvaluation[];
  commits: readonly AssessmentCommit[];
  /** The session's currently eligible pinned entries; used only to label cited entries. */
  knowledge: { pinned: readonly KnowledgeEntryContent[] };
  drafts?: readonly AssessmentDraft[];
  /** Assessments of this learner's earlier sessions on other cases, for transfer. */
  earlier?: readonly Assessment[];
  /** How much help this session offered (e.g. a reduced-help transfer case). */
  help_level?: "standard" | "reduced";
  source: "live" | "fixture" | "stub";
  created_at_utc: string;
};

export type Intervention = {
  evaluation_id: string;
  draft_rev: number;
  outcome: "intervene" | "uncertain";
  evaluated_at_utc: string;
  /** When the guidance reached the learner (timeline `guidance_delivered`). */
  delivered_at_utc: string[];
  timing: "caught_before_save" | "discovered_after_save";
  cited: EntryRef[];
  escalation: EntryRef | null;
};

export type Decision = {
  decision_index: number;
  draft_rev_initial: number;
  draft_rev_final: number;
  initial_decision: string | null;
  final_decision: string | null;
  outcome_class: OutcomeClass;
  interventions: Intervention[];
  /** Every entry revision cited in this decision's evaluations (and escalations), first-cited order. */
  cited_entries: EntryRef[];
  committed: { commit_id: string; evaluation_id: string; at_utc: string; escalated: boolean } | null;
};

export type EntryNote = EntryRef & {
  kind: EntryKind | null;
  /** The expert's verbatim words from the pinned revision; null when it is no longer taught. */
  expert_words: string | null;
  still_taught: boolean;
};

export type SkillNote = EntryNote & { decision_index: number };
export type HelpNote = EntryNote & { decision_indexes: number[]; evaluation_ids: string[] };
export type PracticeItem = EntryNote & { why: string; suggestion: string };

export type TransferNote = {
  compared_with_session_id: string;
  shared_entry_ids: string[];
  earlier_class: OutcomeClass;
  this_class: OutcomeClass;
  earlier_interventions: number;
  this_interventions: number;
  help_level: "standard" | "reduced";
  summary: string;
};

export type Assessment = {
  schema: "ws5.assessment.v0";
  session_id: string;
  help_level: "standard" | "reduced";
  decisions: Decision[];
  skills_demonstrated: SkillNote[];
  needed_help_with: HelpNote[];
  practice_next: PracticeItem[];
  transfer: TransferNote[];
  limitations: string[];
  source: "live" | "fixture" | "stub";
  created_at_utc: string;
  produced_by: { module: string; version: string };
};

const ms = (utc: string) => Date.parse(utc);
const key = (r: EntryRef) => `${r.entry_id}@${r.revision_id}`;
const ref = (r: EntryRef): EntryRef => ({ entry_id: r.entry_id, revision_id: r.revision_id });

function uniqueRefs(refs: readonly EntryRef[]): EntryRef[] {
  const seen = new Map<string, EntryRef>();
  for (const r of refs) if (!seen.has(key(r))) seen.set(key(r), ref(r));
  return [...seen.values()];
}

// Only evaluations that produced a judgement the learner saw (timeline.ts uses the same rule).
const judged = (e: AssessmentEvaluation) => e.outcome !== null && (e.status === "done" || e.status === "stale");

/** Labels come only from the pinned revision: the cited quote if it is in that revision, else its first quote. */
function note(r: EntryRef, pinned: readonly KnowledgeEntryContent[], citedQuote?: string): EntryNote {
  const entry = pinned.find(e => e.entry_id === r.entry_id && e.revision_id === r.revision_id);
  const inEntry = citedQuote !== undefined && entry !== undefined && collectQuotes(entry).some(q => q.quote.includes(citedQuote));
  return {
    ...ref(r),
    kind: entry?.kind ?? null,
    expert_words: entry ? (inEntry ? citedQuote! : entry.expert_words[0]?.quote ?? null) : null,
    still_taught: Boolean(entry),
  };
}

function citedQuote(evaluations: readonly AssessmentEvaluation[], r: EntryRef, evaluationIds?: readonly string[]): string | undefined {
  return evaluations
    .filter(e => !evaluationIds || evaluationIds.includes(e.evaluation_id))
    .flatMap(e => e.cited)
    .find(c => c.entry_id === r.entry_id && c.revision_id === r.revision_id)?.quote;
}

/** Draft revisions grouped into decisions: a commit closes a decision; later drafts open the next. */
function segment(input: AssessmentInput): { revs: number[]; commit: AssessmentCommit | null }[] {
  const revs = [
    ...new Set([
      ...(input.drafts ?? []).map(d => d.draft_rev),
      ...input.timeline.map(t => t.draft_rev),
      ...input.evaluations.map(e => e.draft_rev),
      ...input.commits.map(c => c.draft_rev),
    ]),
  ].sort((a, b) => a - b);
  const commits = [...input.commits].sort((a, b) => ms(a.at_utc) - ms(b.at_utc));
  const out: { revs: number[]; commit: AssessmentCommit | null }[] = [];
  let rest = revs;
  for (const c of commits) {
    const mine = rest.filter(r => r <= c.draft_rev);
    if (!mine.length) continue;
    out.push({ revs: mine, commit: c });
    rest = rest.filter(r => r > c.draft_rev);
  }
  if (rest.length) out.push({ revs: rest, commit: null });
  return out;
}

function classify(commit: AssessmentCommit | null, finalOutcome: string | null, interventions: readonly Intervention[]): OutcomeClass {
  if (!commit || commit.escalated) return "unresolved_or_escalated";
  if (finalOutcome !== "ok") return "unresolved_or_escalated";
  if (interventions.some(i => i.timing === "discovered_after_save")) return "unresolved_or_escalated";
  return interventions.length ? "correct_after_help" : "correct_unassisted";
}

function buildDecisions(input: AssessmentInput): Decision[] {
  return segment(input).map((seg, i) => {
    const inSeg = (rev: number) => seg.revs.includes(rev);
    const evaluations = input.evaluations.filter(e => inSeg(e.draft_rev) && judged(e)).sort((a, b) => ms(a.updated_at_utc) - ms(b.updated_at_utc));
    const commitAt = seg.commit ? ms(seg.commit.at_utc) : Number.POSITIVE_INFINITY;

    const interventions: Intervention[] = evaluations
      .filter(e => e.outcome === "intervene" || e.outcome === "uncertain")
      // An uncertain review that the commit itself relied on (escalated save) is the decision's
      // resolution, not a correction: it still counts as help, timed before the save.
      .map(e => ({
        evaluation_id: e.evaluation_id,
        draft_rev: e.draft_rev,
        outcome: e.outcome as "intervene" | "uncertain",
        evaluated_at_utc: e.updated_at_utc,
        delivered_at_utc: input.timeline
          .filter(t => t.kind === "guidance_delivered" && t.evaluation_id === e.evaluation_id)
          .map(t => t.at_utc),
        timing: ms(e.updated_at_utc) < commitAt || seg.commit?.evaluation_id === e.evaluation_id ? "caught_before_save" : "discovered_after_save",
        cited: uniqueRefs(e.cited),
        escalation: e.escalation ? ref(e.escalation) : null,
      }));

    const finalEval = seg.commit ? input.evaluations.find(e => e.evaluation_id === seg.commit!.evaluation_id) ?? null : null;
    const draftText = (rev: number) => input.drafts?.find(d => d.draft_rev === rev)?.decision ?? null;
    const first = seg.revs[0];
    const last = seg.commit?.draft_rev ?? seg.revs[seg.revs.length - 1];
    return {
      decision_index: i + 1,
      draft_rev_initial: first,
      draft_rev_final: last,
      initial_decision: draftText(first),
      final_decision: draftText(last),
      outcome_class: classify(seg.commit, finalEval?.outcome ?? null, interventions),
      interventions,
      cited_entries: uniqueRefs(evaluations.flatMap(e => [...e.cited, ...(e.escalation ? [e.escalation] : [])])),
      committed: seg.commit
        ? { commit_id: seg.commit.commit_id, evaluation_id: seg.commit.evaluation_id, at_utc: seg.commit.at_utc, escalated: Boolean(seg.commit.escalated) }
        : null,
    };
  });
}

const helpRefs = (d: Decision) => uniqueRefs(d.interventions.flatMap(i => [...i.cited, ...(i.escalation ? [i.escalation] : [])]));

const CLASS_WORDS: Record<OutcomeClass, string> = {
  correct_unassisted: "correct without help",
  correct_after_help: "correct after help",
  unresolved_or_escalated: "unresolved or escalated",
};

function buildTransfer(session_id: string, decisions: readonly Decision[], earlier: readonly Assessment[], help_level: "standard" | "reduced"): TransferNote[] {
  const latest = decisions[decisions.length - 1];
  if (!latest) return [];
  const nowCited = new Set(latest.cited_entries.map(r => r.entry_id));
  return earlier
    .filter(a => a.session_id !== session_id)
    .flatMap(a => {
      const prior = a.decisions.find(d => d.outcome_class !== "correct_unassisted") ?? a.decisions[a.decisions.length - 1];
      if (!prior) return [];
      const shared = [...new Set(a.needed_help_with.map(n => n.entry_id))].filter(id => nowCited.has(id));
      const summary = shared.length
        ? `After needing help with ${shared.join(", ")} in session ${a.session_id} (${CLASS_WORDS[prior.outcome_class]}), the learner was ` +
          `${CLASS_WORDS[latest.outcome_class]} on one further case with ${latest.interventions.length} intervention(s) and ${help_level} help. ` +
          "One further case is an indication, not proof."
        : `No expert entry that needed help in session ${a.session_id} came up again; transfer could not be assessed from this case.`;
      return [
        {
          compared_with_session_id: a.session_id,
          shared_entry_ids: shared,
          earlier_class: prior.outcome_class,
          this_class: latest.outcome_class,
          earlier_interventions: prior.interventions.length,
          this_interventions: latest.interventions.length,
          help_level,
          summary,
        },
      ];
    });
}

export function buildAssessment(input: AssessmentInput): Assessment {
  const pinned = input.knowledge.pinned;
  const decisions = buildDecisions(input);
  const help_level = input.help_level ?? "standard";

  const needed = new Map<string, HelpNote>();
  for (const d of decisions) {
    for (const iv of d.interventions) {
      for (const r of [...iv.cited, ...(iv.escalation ? [iv.escalation] : [])]) {
        const n = needed.get(key(r)) ?? { ...note(r, pinned, citedQuote(input.evaluations, r, [iv.evaluation_id])), decision_indexes: [], evaluation_ids: [] };
        if (!n.decision_indexes.includes(d.decision_index)) n.decision_indexes.push(d.decision_index);
        if (!n.evaluation_ids.includes(iv.evaluation_id)) n.evaluation_ids.push(iv.evaluation_id);
        needed.set(key(r), n);
      }
    }
  }

  const skills: SkillNote[] = [];
  for (const d of decisions) {
    if (d.outcome_class === "unresolved_or_escalated" || !d.committed) continue;
    const finalEval = input.evaluations.find(e => e.evaluation_id === d.committed!.evaluation_id);
    const coached = new Set(helpRefs(d).map(r => r.entry_id));
    for (const r of uniqueRefs(finalEval?.cited ?? [])) {
      if (!coached.has(r.entry_id)) skills.push({ ...note(r, pinned, citedQuote([finalEval!], r)), decision_index: d.decision_index });
    }
  }

  const practice_next: PracticeItem[] = [...needed.values()].map(n => {
    const ivs = decisions.flatMap(d => d.interventions.filter(i => n.evaluation_ids.includes(i.evaluation_id)));
    const escalated = ivs.some(i => i.outcome === "uncertain");
    const where = `decision ${n.decision_indexes.join(", ")} (evaluation ${n.evaluation_ids.join(", ")})`;
    return {
      ...ref(n),
      kind: n.kind,
      expert_words: n.expert_words,
      still_taught: n.still_taught,
      why: escalated ? `The case was not settled by the knowledge in ${where}; the expert's rule had to be followed.` : `Needed a coached correction in ${where}.`,
      suggestion: "Practise on another unseen case where this applies, with reduced help, before relying on it alone.",
    };
  });

  const transfer = buildTransfer(input.session_id, decisions, input.earlier ?? [], help_level);

  const limitations = [
    MASTERY_DISCLAIMER,
    "“Correct” means the tutor's evaluator found the saved decision consistent with the confirmed expert knowledge pinned for this session. No answer key was used, and the expert did not check this case.",
    `Observed: ${decisions.length} decision(s) in one session. This is a record of what happened, not a validated learning benchmark.`,
    transfer.length
      ? `Transfer is reported separately and rests on ${transfer.length} further case(s) only.`
      : "Transfer was not tested: no second, distinct case with reduced help was done.",
  ];
  const notes = [...needed.values(), ...skills];
  if (notes.some(n => !n.still_taught)) limitations.push("Some cited entries were withdrawn or changed after the session; they are listed without their words.");
  if (input.source !== "live") limitations.push(`Built from ${input.source === "fixture" ? "FIXTURE" : "STUB"} data: not a real learner session.`);

  return {
    schema: "ws5.assessment.v0",
    session_id: input.session_id,
    help_level,
    decisions,
    skills_demonstrated: skills,
    needed_help_with: [...needed.values()],
    practice_next,
    transfer,
    limitations,
    source: input.source,
    created_at_utc: input.created_at_utc,
    produced_by: { ...ASSESSMENT_MODULE },
  };
}

// --- Markdown (knowledge/assessments/<sid>.md) -------------------------------------

const CLASS_TITLE: Record<OutcomeClass, string> = {
  correct_unassisted: "Correct without help",
  correct_after_help: "Correct after help",
  unresolved_or_escalated: "Unresolved or escalated",
};

const words = (n: EntryNote) =>
  n.still_taught && n.expert_words ? `${n.kind} \`${n.entry_id}\` · ${n.revision_id}: the expert said "${n.expert_words}"` : `\`${n.entry_id}\` · ${n.revision_id} (no longer taught: withdrawn or changed since)`;

export function renderAssessmentMarkdown(a: Assessment): string {
  const lines = [`# Learning assessment · session \`${a.session_id}\``, ""];
  lines.push(`> **Source:** ${a.source === "live" ? "live session" : a.source.toUpperCase()} · help level: ${a.help_level} · ${a.created_at_utc}`, "");

  lines.push("## What happened", "");
  for (const d of a.decisions) {
    lines.push(`### Decision ${d.decision_index}: ${CLASS_TITLE[d.outcome_class]}`, "");
    lines.push(`- First draft (rev ${d.draft_rev_initial}): ${d.initial_decision === null ? "_not recorded_" : `"${d.initial_decision}" (learner's words)`}`);
    for (const iv of d.interventions) {
      const timing = iv.timing === "caught_before_save" ? "caught before save" : "discovered after save";
      const delivered = iv.delivered_at_utc.length ? `, guidance delivered ${iv.delivered_at_utc.join(", ")}` : "";
      const cited = [...iv.cited, ...(iv.escalation ? [iv.escalation] : [])].map(r => `\`${r.entry_id}\``).join(", ") || "none";
      lines.push(`- ${iv.outcome === "intervene" ? "Intervention" : "Not settled by the knowledge"} on rev ${iv.draft_rev} (${timing}${delivered}); cited ${cited}`);
    }
    if (d.committed) {
      lines.push(
        `- Saved rev ${d.draft_rev_final}${d.final_decision === null ? "" : ` ("${d.final_decision}")`} at ${d.committed.at_utc}` +
          `${d.committed.escalated ? " with escalation" : ""} (commit \`${d.committed.commit_id}\`, evaluation \`${d.committed.evaluation_id}\`)`
      );
    } else {
      lines.push("- Not saved in this session.");
    }
    lines.push("");
  }

  lines.push("## What needed help", "");
  lines.push(...(a.needed_help_with.length ? a.needed_help_with.map(n => `- ${words(n)}`) : ["_Nothing: no intervention was needed._"]), "");

  lines.push("## What to practise next", "");
  lines.push(...(a.practice_next.length ? a.practice_next.map(p => `- ${words(p)}\n  ${p.why} ${p.suggestion}`) : ["_No intervention pointed to a specific entry._"]), "");

  lines.push("## Applied without coaching", "");
  lines.push(...(a.skills_demonstrated.length ? a.skills_demonstrated.map(s => `- ${words(s)} (decision ${s.decision_index})`) : ["_None recorded._"]), "");

  lines.push("## Transfer", "");
  lines.push(...(a.transfer.length ? a.transfer.map(t => `- ${t.summary}`) : ["_Not tested._"]), "");

  lines.push("## Limitations", "", ...a.limitations.map(l => `- ${l}`), "");
  return lines.join("\n");
}
