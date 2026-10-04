// WS3 swap-in for web/lib/expert/synthesis.ts (`getGaps(state)` / `buildDraft(state, parentRevision?)`,
// notes/ws3-sprints/sprint-3-debrief-confirmation.md). WS3's state type is not merged yet, so
// `Ws3SynthesisState` is the WS5-side shape; WS3 maps its session state onto it. Output uses
// WS3's own contracts (OpenQuestion, DraftRevision, DraftStep) unchanged.

import type { DraftRevision, DraftStep, ExpertConfirmation, ExpertExchange, OpenQuestion, PointingEvent, StepKind } from "@/lib/expert/contracts";
import { findGaps } from "../gaps";
import { collectQuotes, type EntryKind, type KnowledgeEntryContent } from "../schema";
import { synthesize } from "../synthesize";
import type { Gap, GapAnswer, GapKind, SynthesisOutput } from "../synthesis-types";
import { knowledgeImageRef } from "./image-ref";

export type Ws3SynthesisState = {
  session_id: string;
  events: readonly PointingEvent[];
  exchanges: readonly ExpertExchange[];
  confirmations: readonly ExpertConfirmation[];
  /** Knowledge entries already stored for this expert (WS6), so unchanged entries keep their revision. */
  prior_entries?: readonly KnowledgeEntryContent[];
  /** Which debrief exchange answered which gap (`begin_question` gap_id). */
  gap_answers?: readonly GapAnswer[];
};

/** A WS3 OpenQuestion plus the WS5 gap kind and priority (1 is asked first). */
export type Ws3Gap = OpenQuestion & { kind: GapKind; priority: Gap["priority"] };

export type Ws3SynthesisModule = {
  getGaps(state: Ws3SynthesisState): Ws3Gap[];
  buildDraft(state: Ws3SynthesisState, parentRevision?: DraftRevision): DraftRevision;
};

const WHY: Record<GapKind, string> = {
  unclear_guardrail: "A newcomer needs to know exactly when to stop.",
  conflict: "The expert's answers disagree, so nothing here can be taught yet.",
  missing_reason: "Without the reason a newcomer cannot apply this to a trace they have not seen.",
  unqualified_exception: "A tendency without its exception would be taught as an absolute rule.",
  ambiguous_reference: "The words cannot be linked to the right part of the screen.",
  missing_evidence: "Every step must link to a screen moment and the expert's words.",
};

// WS3's StepKind has no "escalation"; a confirmed instruction to escalate is a guardrail there.
const STEP_KIND: Record<EntryKind, StepKind> = {
  step: "step",
  decision: "decision",
  exception: "exception",
  guardrail: "guardrail",
  escalation: "guardrail",
};

function run(state: Ws3SynthesisState): { out: SynthesisOutput; ordered: KnowledgeEntryContent[] } {
  const base = {
    events: state.events,
    exchanges: state.exchanges,
    gap_answers: state.gap_answers,
    resolve_image_ref: knowledgeImageRef,
  };
  // Without stored entries, the session's own uncorrected draft is what a correction revises.
  const prior = state.prior_entries ?? synthesize({ ...base, confirmations: [], prior: [] }).entries;
  const out = synthesize({ ...base, confirmations: state.confirmations, prior });
  const all = [...out.entries, ...prior];
  const ordered = out.workflow.steps.map(s => {
    const e = all.find(x => x.entry_id === s.entry_id && x.revision_id === s.revision_id);
    if (!e) throw new Error(`workflow links ${s.entry_id}@${s.revision_id}, which synthesis did not return`);
    return e;
  });
  return { out, ordered };
}

export function toWs3Gap(g: Gap): Ws3Gap {
  return {
    open_question_id: g.gap_id,
    missing_fact: g.description,
    why_it_matters: WHY[g.kind],
    related_event_ids: [...g.related_event_ids],
    related_exchange_ids: [...g.related_exchange_ids],
    answered_by_exchange_id: null,
    kind: g.kind,
    priority: g.priority,
  };
}

const sameSteps = (a: DraftStep[], b: DraftStep[]) => JSON.stringify(a) === JSON.stringify(b);
const revisionNo = (id: string) => Number(/^rev-(\d+)$/.exec(id)?.[1] ?? 0);

export const ws3Synthesis: Ws3SynthesisModule = {
  getGaps(state) {
    const { ordered } = run(state);
    return findGaps({ ...state, prior: state.prior_entries ?? [], entries: ordered }).map(toWs3Gap);
  },

  buildDraft(state, parentRevision) {
    const { out, ordered } = run(state);
    const textById = new Map(out.teach_back?.items.map(i => [i.entry_id, i.text]) ?? []);
    const steps: DraftStep[] = ordered.map(e => ({
      step_id: e.entry_id,
      text: textById.get(e.entry_id) ?? "",
      kind: STEP_KIND[e.kind],
      supporting_event_ids: [...new Set(e.visual_evidence.map(v => v.event_id))].sort(),
      supporting_exchange_ids: [...new Set(collectQuotes(e).map(q => q.exchange_id))].sort(),
      supported: false,
    })).map(s => ({ ...s, supported: s.supporting_event_ids.length > 0 && s.supporting_exchange_ids.length > 0 }));
    // Unchanged content keeps the parent revision: no duplicate revision for the same draft.
    if (parentRevision && sameSteps(parentRevision.steps, steps)) return parentRevision;

    const changed = parentRevision
      ? steps.filter(s => !parentRevision.steps.some(p => sameSteps([p], [s]))).map(s => s.step_id)
      : [];
    const removed = parentRevision ? parentRevision.steps.filter(p => !steps.some(s => s.step_id === p.step_id)).map(p => p.step_id) : [];
    const times = ordered.map(e => e.created_at_utc).sort();
    return {
      revision_id: parentRevision ? `rev-${revisionNo(parentRevision.revision_id) + 1}` : "rev-1",
      session_id: state.session_id,
      created_at_utc: times.at(-1) ?? parentRevision?.created_at_utc ?? new Date(0).toISOString(),
      parent_revision_id: parentRevision?.revision_id ?? null,
      steps,
      change_reason: parentRevision
        ? [changed.length ? `changed ${changed.join(", ")}` : null, removed.length ? `removed ${removed.join(", ")}` : null]
            .filter(Boolean)
            .join("; ")
        : null,
      // The synthesis adapter rebuilds from entries; it does not know which exchange carried a correction.
      change_exchange_ids: [],
    };
  },
};
