// WS6 swap-in for the TutorEvaluator hosted in web/lib/backend/modules.ts
// (notes/ws6-sprints/sprint-3-newcomer-presave.md). WS6 Sprint 3 is not merged yet, so the Ws6*
// types mirror the documented signature and the ws6.v0 contracts (LearnerDraft, Evaluation,
// KnowledgeRevision on branch worktree-ws06-backend) structurally.
//
// A thrown error means "evaluation failed": WS6 stores status "failed", which never permits a
// commit. We never turn a failure into "uncertain", because uncertain may allow an escalated save.

import type { ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import { assertNoEvaluatorMaterial } from "../case-view";
import type { KnowledgeCandidate } from "../eligibility";
import { evaluate } from "../evaluate";
import { TUTOR_EVALUATOR, type EvidencePointer, type Judge } from "../evaluation-types";
import { createAnthropicJudge } from "../judge-anthropic";
import { describeScreenContext, fromWs6VisualContext, type Ws6VisualContext } from "../observation";
import type { KnowledgeEntryContent } from "../schema";
import type { Ws6KnowledgeRevision } from "./ws6-synthesis-module";

/** WS6 `LearnerDraft` (ws6.v0). */
export type Ws6LearnerDraft = {
  session_id: string;
  draft_rev: number;
  decision: string;
  reason: string;
  visual_context: Ws6VisualContext[];
  updated_at_utc: string;
  source: "live" | "stub" | "fixture";
};

/**
 * WS6 `LearnerCase` (documented for S3, not in ws6.v0 yet). `visible_context` is a WS5 request:
 * the learner-visible facts WS4 writes per case, as text.
 */
export type Ws6LearnerCase = {
  case_id: string;
  title: string | null;
  trace_asset?: string;
  shown_to_expert?: boolean;
  source: "live" | "stub" | "fixture";
  visible_context?: string[];
};

export type Ws6Citation = { entry_id: string; revision_id: string; exchange_ids: string[]; quote?: string };

export type Ws6EvaluatorResult = {
  outcome: string;
  cited: Ws6Citation[];
  feedback_text: string;
  uncertainty?: string;
  // Fields WS6's Evaluation already carries (optional there).
  guiding_question: string;
  escalation: { entry_id: string; revision_id: string } | null;
  // Extensions (WS5 requests WS6 to store them): evidence pointers per cited entry, guard audit.
  evidence: (EvidencePointer & { revision_id: string })[];
  guard_notes: string[];
};

export type Ws6TutorEvaluator = {
  id: string;
  version: string;
  evaluate(input: { draft: Ws6LearnerDraft; case_view: Ws6LearnerCase; knowledge: Ws6KnowledgeRevision[] }): Promise<Ws6EvaluatorResult>;
};

export type Ws6TutorEvaluatorOptions = {
  /** Parsed WS5 content of a revision (parseEntryMarkdown of its content_path). */
  load_content: (rev: Ws6KnowledgeRevision) => KnowledgeEntryContent | Promise<KnowledgeEntryContent>;
  /** Linked records and current pointers, re-read at evaluation time (never cached across changes). */
  load_records: () => Promise<{
    exchanges: ExpertExchange[];
    events: PointingEvent[];
    /** entry_id → current_revision_no from entries/<id>/current.json. */
    current_revision_no_by_entry: Record<string, number>;
  }>;
  /** Must match the session's ?allow_fixture_knowledge flag. */
  allow_fixture: boolean;
  judge?: Judge;
};

const ws5RevisionId = (revisionNo: number) => `rev-${revisionNo}`;

export function createWs6TutorEvaluator(options: Ws6TutorEvaluatorOptions): Ws6TutorEvaluator {
  const judge = options.judge ?? createAnthropicJudge();
  return {
    id: TUTOR_EVALUATOR.id,
    version: TUTOR_EVALUATOR.version,
    async evaluate({ draft, case_view, knowledge }) {
      assertNoEvaluatorMaterial(case_view, "case_view");
      if (case_view.shown_to_expert === true) throw new Error(`case ${case_view.case_id} was shown to the expert; the tutor needs an unseen case`);

      const records = await options.load_records();
      const candidates: KnowledgeCandidate[] = [];
      const ws6Id = new Map<string, string>();
      for (const rev of knowledge) {
        const entry = await options.load_content(rev);
        if (entry.entry_id !== rev.entry_id || entry.revision_id !== ws5RevisionId(rev.revision_no)) {
          throw new Error(`content of ${rev.revision_id} is ${entry.entry_id}@${entry.revision_id}, expected ${rev.entry_id}@rev-${rev.revision_no}`);
        }
        candidates.push({ record_type: "knowledge_entry", path: rev.content_path, entry });
        ws6Id.set(`${entry.entry_id}@${entry.revision_id}`, rev.revision_id);
      }
      const current_revision_by_entry = Object.fromEntries(
        Object.entries(records.current_revision_no_by_entry).map(([id, no]) => [id, ws5RevisionId(no)])
      );
      const toWs6 = (entry_id: string, revision_id: string) => {
        const id = ws6Id.get(`${entry_id}@${revision_id}`);
        if (!id) throw new Error(`no WS6 revision for ${entry_id}@${revision_id}`);
        return id;
      };

      // What the learner marked on screen, as position text (Sprint 4 observation contract).
      const screen = fromWs6VisualContext(draft, case_view.case_id);
      const r = await evaluate(
        {
          draft: {
            draft_rev: draft.draft_rev,
            decision: draft.decision,
            reason: draft.reason,
            visual_context: screen ? describeScreenContext(screen) : null,
          },
          case_view: {
            case_id: case_view.case_id,
            title: case_view.title,
            visible_context: case_view.visible_context ?? [],
            source: case_view.source,
          },
          knowledge: {
            candidates,
            ctx: { current_revision_by_entry, exchanges: records.exchanges, events: records.events, allow_fixture: options.allow_fixture },
          },
        },
        judge
      );

      return {
        outcome: r.outcome,
        cited: r.cited.map(c => ({ ...c, revision_id: toWs6(c.entry_id, c.revision_id) })),
        feedback_text: r.feedback_text,
        ...(r.uncertainty ? { uncertainty: r.uncertainty } : {}),
        guiding_question: r.guiding_question,
        escalation: r.escalation ? { entry_id: r.escalation.entry_id, revision_id: toWs6(r.escalation.entry_id, r.escalation.revision_id) } : null,
        evidence: r.evidence.map(e => {
          const rev = r.cited.find(c => c.entry_id === e.entry_id)!.revision_id;
          return { ...e, revision_id: toWs6(e.entry_id, rev) };
        }),
        guard_notes: r.guard_notes,
      };
    },
  };
}
