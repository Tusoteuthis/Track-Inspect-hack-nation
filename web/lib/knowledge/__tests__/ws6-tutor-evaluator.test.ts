import { describe, expect, it } from "vitest";
import { loadDraftFixtures } from "@/fixtures/ws5/drafts/load";
import { createWs6TutorEvaluator, type Ws6LearnerCase, type Ws6LearnerDraft } from "../adapters/ws6-tutor-evaluator";
import type { Ws6KnowledgeRevision } from "../adapters/ws6-synthesis-module";
import { EvaluatorFieldError } from "../case-view";
import { IneligibleKnowledgeError } from "../retrieve";
import { ctx, eligibleCandidates, fx, GUARDRAIL_QUOTE, scriptedJudge, verdict } from "./helpers";

// WS6's documented interface (notes/ws6-sprints/sprint-3-newcomer-presave.md), verbatim in shape.
type Citation = { entry_id: string; revision_id: string; exchange_ids: string[]; quote?: string };
interface DocumentedTutorEvaluator {
  id: string;
  version: string;
  evaluate(input: { draft: Ws6LearnerDraft; case_view: Ws6LearnerCase; knowledge: Ws6KnowledgeRevision[] }): Promise<{
    outcome: string;
    cited: Citation[];
    feedback_text: string;
    uncertainty?: string;
  }>;
}

const ws6Id = (entryId: string, revisionId: string) => `rev-20261004100000-${entryId.slice(4, 10)}${revisionId.slice(4)}`;

function ws6Revision(entryId: string, revisionId: string): Ws6KnowledgeRevision {
  const no = Number(revisionId.slice(4));
  return {
    schema_version: "ws6.v0",
    entry_id: entryId,
    revision_id: ws6Id(entryId, revisionId),
    revision_no: no,
    parent_revision_id: null,
    status: "confirmed",
    content_path: `entries/${entryId}/rev-${no}.md`,
    evidence: { event_ids: [], exchange_ids: [], asset_ids: [] },
    produced_by: { module: "ws5-fixtures", version: "0.1.0", source: "fixture" },
    created_at_utc: "2026-10-04T10:00:00.000Z",
  };
}

const pinnedRevs = eligibleCandidates.map(c => ws6Revision(c.entry.entry_id, c.entry.revision_id));
const contentByWs6Id = new Map(
  [...fx.candidates].map(c => [ws6Id(c.entry.entry_id, c.entry.revision_id), c.entry] as const)
);

const d = loadDraftFixtures().find(x => x.draft_id === "d02-guardrail-violation")!;
const draft: Ws6LearnerDraft = {
  session_id: "sess-fixture-newcomer",
  draft_rev: 3,
  decision: d.draft.decision,
  reason: d.draft.reason,
  visual_context: [],
  updated_at_utc: "2026-10-04T10:00:00.000Z",
  source: "fixture",
};
const caseView: Ws6LearnerCase = { ...d.case_view, trace_asset: "trace-102", shown_to_expert: false };

function make(judge = scriptedJudge(verdict({ outcome: "intervene", citations: [{ entry_id: "ent-guardrail-c", quote: GUARDRAIL_QUOTE }] }))) {
  const evaluator = createWs6TutorEvaluator({
    load_content: rev => contentByWs6Id.get(rev.revision_id)!,
    load_records: async () => ({
      exchanges: fx.exchanges,
      events: fx.events,
      current_revision_no_by_entry: Object.fromEntries(Object.entries(ctx.current_revision_by_entry).map(([k, v]) => [k, Number(v.slice(4))])),
    }),
    allow_fixture: true,
    judge,
  });
  return { evaluator, judge };
}

describe("createWs6TutorEvaluator", () => {
  it("implements WS6's documented TutorEvaluator", () => {
    const documented: DocumentedTutorEvaluator = make().evaluator;
    expect(documented.id).toBe("ws5-tutor");
    expect(documented.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("gives the judge the learner's marked region as text (no case id), and says so when none is marked", async () => {
    const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.2, coordinate_space: "original_frame_normalized" as const, frame_width_px: 1600, frame_height_px: 900 };
    const { evaluator, judge } = make();
    await evaluator.evaluate({ draft: { ...draft, visual_context: [{ asset_id: "frm-001", region }] }, case_view: caseView, knowledge: pinnedRevs });
    expect(judge.inputs[0].draft.visual_context).toContain("marked a region");
    expect(judge.inputs[0].draft.visual_context).not.toContain(caseView.case_id);

    const second = make();
    await second.evaluator.evaluate({ draft, case_view: caseView, knowledge: pinnedRevs });
    expect(second.judge.inputs[0].draft.visual_context).toBeNull();
  });

  it("maps WS5 revisions back to WS6 revision ids in citations and evidence", async () => {
    const r = await make().evaluator.evaluate({ draft, case_view: caseView, knowledge: pinnedRevs });
    expect(r.outcome).toBe("intervene");
    expect(r.cited).toEqual([
      { entry_id: "ent-guardrail-c", revision_id: ws6Id("ent-guardrail-c", "rev-1"), exchange_ids: ["exc-003"], quote: GUARDRAIL_QUOTE },
    ]);
    expect(r.evidence[0]).toMatchObject({ entry_id: "ent-guardrail-c", revision_id: ws6Id("ent-guardrail-c", "rev-1"), event_id: "evt-002" });
    expect(r.feedback_text.startsWith(r.guiding_question)).toBe(true);
    expect(r.escalation).toBeNull();
    expect(r).not.toHaveProperty("uncertainty");
  });

  it("refuses a pin set that includes a revoked or superseded revision", async () => {
    for (const [entry, rev] of [["ent-revoked-a", "rev-1"], ["ent-decision-a", "rev-1"]]) {
      await expect(
        make().evaluator.evaluate({ draft, case_view: caseView, knowledge: [...pinnedRevs, ws6Revision(entry, rev)] })
      ).rejects.toThrow(IneligibleKnowledgeError);
    }
  });

  it("refuses evaluator material on the raw WS6 case and cases shown to the expert", async () => {
    const leaky = { ...caseView, evaluator_notes: "expected: not A" } as Ws6LearnerCase;
    await expect(make().evaluator.evaluate({ draft, case_view: leaky, knowledge: pinnedRevs })).rejects.toThrow(EvaluatorFieldError);
    await expect(
      make().evaluator.evaluate({ draft, case_view: { ...caseView, shown_to_expert: true }, knowledge: pinnedRevs })
    ).rejects.toThrow(/shown to the expert/);
  });

  it("refuses content that does not match its WS6 revision", async () => {
    const evaluator = createWs6TutorEvaluator({
      load_content: () => contentByWs6Id.get(ws6Id("ent-step-a", "rev-1"))!,
      load_records: async () => ({ exchanges: fx.exchanges, events: fx.events, current_revision_no_by_entry: {} }),
      allow_fixture: true,
      judge: scriptedJudge(verdict()),
    });
    await expect(evaluator.evaluate({ draft, case_view: caseView, knowledge: [ws6Revision("ent-guardrail-c", "rev-1")] })).rejects.toThrow(
      /expected ent-guardrail-c@rev-1/
    );
  });

  it("returns uncertainty and an escalation mapped to WS6 ids for an escalated case", async () => {
    const judge = scriptedJudge(verdict({ outcome: "uncertain", escalation_entry_id: "ent-escalate-unclear" }));
    const r = await make(judge).evaluator.evaluate({ draft, case_view: caseView, knowledge: pinnedRevs });
    expect(r.outcome).toBe("uncertain");
    expect(r.escalation).toEqual({ entry_id: "ent-escalate-unclear", revision_id: ws6Id("ent-escalate-unclear", "rev-1") });
    expect(r.uncertainty).toEqual(expect.any(String));
  });
});
