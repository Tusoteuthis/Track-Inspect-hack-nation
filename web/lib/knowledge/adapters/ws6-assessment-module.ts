// WS6 swap-in for the assessment module (notes/ws6-api-v0.md §5.8 and WS5 open question 5): on
// commit or session end WS6 calls build() and persists `assessment` as
// knowledge/assessments/<sid>.json and `markdown` as <sid>.md. WS6 Sprint 3 is not merged, so the
// Ws6* types mirror ws6.v0 (LearnerDraft, Evaluation, Commit, Assessment) structurally.
// We fill WS6's minimal fields and put the full WS5 structure in `content`.

import type { ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import { ASSESSMENT_MODULE, buildAssessment, renderAssessmentMarkdown, type Assessment, type AssessmentEvaluation } from "../assessment";
import { selectEligible, type KnowledgeCandidate } from "../eligibility";
import type { KnowledgeEntryContent } from "../schema";
import { buildTimeline, type GuidanceDelivery } from "../timeline";
import type { Ws6LearnerDraft } from "./ws6-tutor-evaluator";
import type { Ws6KnowledgeRevision } from "./ws6-synthesis-module";

type Ws6Source = "live" | "stub" | "fixture";
type Ws6Ref = { entry_id: string; revision_id: string };

/** WS6 `Evaluation` (ws6.v0). */
export type Ws6Evaluation = {
  evaluation_id: string;
  session_id: string;
  draft_rev: number;
  knowledge_revision_ids: string[];
  status: "pending" | "done" | "failed" | "stale";
  outcome: string | null;
  cited: { entry_id: string; revision_id: string; exchange_ids: string[]; quote?: string }[];
  feedback_text: string | null;
  guiding_question?: string | null;
  escalation?: Ws6Ref | null;
  created_at_utc: string;
  updated_at_utc: string;
};

/** WS6 `Commit` (ws6.v0) plus the documented `escalated` flag of the commit request. */
export type Ws6Commit = { commit_id: string; session_id: string; draft_rev: number; evaluation_id: string; at_utc: string; escalated?: boolean };

/** WS6 `Assessment` (ws6.v0). */
export type Ws6Assessment = {
  session_id: string;
  initial_decision: string | null;
  assistance: string[];
  final_outcome: string | null;
  evidence_used: Ws6Ref[];
  practice_next: string[];
  source: Ws6Source;
  created_at_utc: string;
  content: Assessment;
};

export type Ws6AssessmentInput = {
  session: { session_id: string; source: Ws6Source };
  drafts: Ws6LearnerDraft[];
  evaluations: Ws6Evaluation[];
  commits: Ws6Commit[];
  /** Every revision referenced by the session (pinned and cited), to map WS6 ids to WS5 revisions. */
  revisions: Ws6KnowledgeRevision[];
  deliveries?: GuidanceDelivery[];
  /** Earlier assessments of this learner (their `content`), for transfer. */
  earlier?: Assessment[];
  help_level?: "standard" | "reduced";
  now_utc: string;
};

export type Ws6AssessmentModule = {
  id: string;
  version: string;
  build(input: Ws6AssessmentInput): Promise<{ assessment: Ws6Assessment; markdown: string }>;
};

export type Ws6AssessmentOptions = {
  load_content: (rev: Ws6KnowledgeRevision) => KnowledgeEntryContent | Promise<KnowledgeEntryContent>;
  /** Re-read at build time: labels come only from revisions that are teachable now. */
  load_records: () => Promise<{ exchanges: ExpertExchange[]; events: PointingEvent[]; current_revision_no_by_entry: Record<string, number> }>;
  allow_fixture: boolean;
};

const ws5RevisionId = (no: number) => `rev-${no}`;

export function createWs6AssessmentModule(options: Ws6AssessmentOptions): Ws6AssessmentModule {
  return {
    id: ASSESSMENT_MODULE.module,
    version: ASSESSMENT_MODULE.version,
    async build(input) {
      const byWs6 = new Map(input.revisions.map(r => [r.revision_id, r]));
      const toWs5 = (r: Ws6Ref): Ws6Ref => {
        const rev = byWs6.get(r.revision_id);
        if (!rev) throw new Error(`unknown WS6 revision ${r.revision_id} of ${r.entry_id}`);
        return { entry_id: rev.entry_id, revision_id: ws5RevisionId(rev.revision_no) };
      };
      const toWs6 = new Map(input.revisions.map(r => [`${r.entry_id}@${ws5RevisionId(r.revision_no)}`, r.revision_id]));

      const records = await options.load_records();
      const candidates: KnowledgeCandidate[] = [];
      for (const rev of input.revisions) {
        candidates.push({ record_type: "knowledge_entry", path: rev.content_path, entry: await options.load_content(rev) });
      }
      const { pinned } = selectEligible(candidates, {
        current_revision_by_entry: Object.fromEntries(Object.entries(records.current_revision_no_by_entry).map(([id, no]) => [id, ws5RevisionId(no)])),
        exchanges: records.exchanges,
        events: records.events,
        allow_fixture: options.allow_fixture,
      });

      const evaluations: AssessmentEvaluation[] = input.evaluations.map(e => ({
        evaluation_id: e.evaluation_id,
        draft_rev: e.draft_rev,
        status: e.status,
        outcome: e.outcome,
        cited: e.cited.map(c => ({ ...toWs5(c), exchange_ids: c.exchange_ids, quote: c.quote ?? "" })),
        escalation: e.escalation ? toWs5(e.escalation) : null,
        created_at_utc: e.created_at_utc,
        updated_at_utc: e.updated_at_utc,
      }));
      const drafts = input.drafts.map(d => ({ draft_rev: d.draft_rev, decision: d.decision, reason: d.reason, updated_at_utc: d.updated_at_utc }));
      const source = input.session.source === "live" && input.drafts.every(d => d.source === "live") ? "live" : input.session.source === "stub" ? "stub" : "fixture";

      const content = buildAssessment({
        session_id: input.session.session_id,
        timeline: buildTimeline(drafts, evaluations, input.commits, input.deliveries),
        evaluations,
        commits: input.commits,
        drafts,
        knowledge: { pinned },
        earlier: input.earlier,
        help_level: input.help_level,
        source,
        created_at_utc: input.now_utc,
      });

      const last = content.decisions[content.decisions.length - 1] ?? null;
      const first = content.decisions[0] ?? null;
      const backToWs6 = (r: Ws6Ref): Ws6Ref => ({ entry_id: r.entry_id, revision_id: toWs6.get(`${r.entry_id}@${r.revision_id}`) ?? r.revision_id });
      const assessment: Ws6Assessment = {
        session_id: content.session_id,
        initial_decision: first?.initial_decision ?? null,
        assistance: content.decisions.flatMap(d =>
          d.interventions.map(
            i => `decision ${d.decision_index}: ${i.outcome} on draft rev ${i.draft_rev} (${i.timing.replaceAll("_", " ")}), cited ${[...i.cited, ...(i.escalation ? [i.escalation] : [])].map(r => r.entry_id).join(", ") || "none"}`
          )
        ),
        final_outcome: last?.outcome_class ?? null,
        evidence_used: [...new Map(content.decisions.flatMap(d => d.cited_entries).map(r => [`${r.entry_id}@${r.revision_id}`, backToWs6(r)])).values()],
        practice_next: content.practice_next.map(p => `${p.entry_id}: ${p.why} ${p.suggestion}`),
        source: content.source,
        created_at_utc: content.created_at_utc,
        content,
      };
      return { assessment, markdown: renderAssessmentMarkdown(content) };
    },
  };
}
