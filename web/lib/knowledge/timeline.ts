// The learner timeline for one newcomer session (brief §8): when a decision was proposed, when
// guidance was delivered and when the result was committed. It separates a wrong decision
// caught before save from one discovered after save. Pure; Sprint 4's assessment consumes it.
// Input shapes are the fields of WS6's LearnerDraft / Evaluation / Commit that we read.

export type TimelineDraft = { draft_rev: number; updated_at_utc: string };

export type TimelineEvaluation = {
  evaluation_id: string;
  draft_rev: number;
  status: "pending" | "done" | "failed" | "stale";
  outcome: string | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export type TimelineCommit = { commit_id: string; draft_rev: number; evaluation_id: string; at_utc: string };

/** When feedback actually reached the learner (e.g. spoken by the voice tutor). */
export type GuidanceDelivery = { evaluation_id: string; at_utc: string };

export type TimelineKind = "proposed" | "evaluated" | "guidance_delivered" | "revised" | "committed";

export type TimelineEntry = {
  at_utc: string;
  kind: TimelineKind;
  draft_rev: number;
  evaluation_id?: string;
  commit_id?: string;
  outcome?: string;
  /** Only on `evaluated` entries with outcome "intervene". */
  intervention?: "caught_before_save" | "discovered_after_save";
};

const KIND_ORDER: Record<TimelineKind, number> = { proposed: 0, revised: 1, evaluated: 2, guidance_delivered: 3, committed: 4 };
const GUIDANCE_OUTCOMES = new Set(["intervene", "uncertain"]);
const ms = (utc: string) => Date.parse(utc);

/**
 * @param deliveries When omitted, guidance counts as delivered when the evaluation finished
 *   (text feedback is shown at once). When given, only the listed deliveries count.
 */
export function buildTimeline(
  drafts: readonly TimelineDraft[],
  evaluations: readonly TimelineEvaluation[],
  commits: readonly TimelineCommit[],
  deliveries?: readonly GuidanceDelivery[]
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const firstRev = Math.min(...drafts.map(d => d.draft_rev));
  for (const d of drafts) {
    out.push({ at_utc: d.updated_at_utc, kind: d.draft_rev === firstRev ? "proposed" : "revised", draft_rev: d.draft_rev });
  }

  const firstCommitAt = commits.length ? Math.min(...commits.map(c => ms(c.at_utc))) : Number.POSITIVE_INFINITY;
  // Pending and failed evaluations never produced a judgement the learner saw. A stale one did.
  for (const e of evaluations.filter(e => e.outcome !== null && (e.status === "done" || e.status === "stale"))) {
    const outcome = e.outcome!;
    const entry: TimelineEntry = { at_utc: e.updated_at_utc, kind: "evaluated", draft_rev: e.draft_rev, evaluation_id: e.evaluation_id, outcome };
    if (outcome === "intervene") {
      entry.intervention = ms(e.updated_at_utc) < firstCommitAt ? "caught_before_save" : "discovered_after_save";
    }
    out.push(entry);

    if (!GUIDANCE_OUTCOMES.has(outcome)) continue;
    const delivered = deliveries ? deliveries.filter(x => x.evaluation_id === e.evaluation_id).map(x => x.at_utc) : [e.updated_at_utc];
    for (const at_utc of delivered) {
      out.push({ at_utc, kind: "guidance_delivered", draft_rev: e.draft_rev, evaluation_id: e.evaluation_id, outcome });
    }
  }

  for (const c of commits) {
    out.push({ at_utc: c.at_utc, kind: "committed", draft_rev: c.draft_rev, evaluation_id: c.evaluation_id, commit_id: c.commit_id });
  }

  return out.sort(
    (a, b) =>
      ms(a.at_utc) - ms(b.at_utc) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.draft_rev - b.draft_rev ||
      (a.evaluation_id ?? "").localeCompare(b.evaluation_id ?? "")
  );
}
