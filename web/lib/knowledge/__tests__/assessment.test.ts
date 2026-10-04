import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_MODULE,
  buildAssessment,
  MASTERY_DISCLAIMER,
  renderAssessmentMarkdown,
  type Assessment,
  type AssessmentCommit,
  type AssessmentDraft,
  type AssessmentEvaluation,
  type AssessmentInput,
} from "../assessment";
import { selectEligible } from "../eligibility";
import type { Citation } from "../evaluation-types";
import { buildTimeline, type GuidanceDelivery } from "../timeline";
import { ctx, DECISION_QUOTE, ESCALATION_QUOTE, fx, GUARDRAIL_QUOTE } from "./helpers";

const pinned = selectEligible(fx.candidates, ctx).pinned;
const at = (min: number, sec = 0) => `2026-10-04T10:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.000Z`;

const GUARDRAIL: Citation = { entry_id: "ent-guardrail-c", revision_id: "rev-1", exchange_ids: ["exc-003"], quote: GUARDRAIL_QUOTE };
const DECISION: Citation = { entry_id: "ent-decision-a", revision_id: "rev-2", exchange_ids: ["exc-009"], quote: DECISION_QUOTE };
const ESCALATION: Citation = { entry_id: "ent-escalate-unclear", revision_id: "rev-1", exchange_ids: ["exc-004"], quote: ESCALATION_QUOTE };

const draft = (rev: number, min: number, decision = `FIXTURE decision ${rev}`): AssessmentDraft => ({
  draft_rev: rev,
  decision,
  reason: `FIXTURE reason ${rev}`,
  updated_at_utc: at(min),
});
const evaluation = (id: string, rev: number, min: number, outcome: string, cited: Citation[], over: Partial<AssessmentEvaluation> = {}): AssessmentEvaluation => ({
  evaluation_id: id,
  draft_rev: rev,
  status: "done",
  outcome,
  cited,
  escalation: null,
  created_at_utc: at(min),
  updated_at_utc: at(min, 30),
  ...over,
});
const commit = (id: string, rev: number, evalId: string, min: number, over: Partial<AssessmentCommit> = {}): AssessmentCommit => ({
  commit_id: id,
  draft_rev: rev,
  evaluation_id: evalId,
  at_utc: at(min),
  escalated: false,
  ...over,
});

function input(
  drafts: AssessmentDraft[],
  evaluations: AssessmentEvaluation[],
  commits: AssessmentCommit[],
  over: Partial<AssessmentInput> = {},
  deliveries?: GuidanceDelivery[]
): AssessmentInput {
  return {
    session_id: "sess-fx-newcomer",
    timeline: buildTimeline(drafts, evaluations, commits, deliveries),
    evaluations,
    commits,
    drafts,
    knowledge: { pinned },
    source: "fixture",
    created_at_utc: at(30),
    ...over,
  };
}

// The demo path: wrong draft → intervene (guardrail) → corrected draft → ok → commit.
const helped = () =>
  input(
    [draft(1, 0, "FIXTURE decision A"), draft(2, 2, "FIXTURE decision B")],
    [evaluation("ev-1", 1, 1, "intervene", [GUARDRAIL]), evaluation("ev-2", 2, 3, "ok", [DECISION])],
    [commit("cm-1", 2, "ev-2", 4)]
  );

describe("buildAssessment — outcome classes", () => {
  it("correct_after_help: committed ok after an intervention", () => {
    const a = buildAssessment(helped());
    expect(a.decisions).toHaveLength(1);
    const d = a.decisions[0];
    expect(d.outcome_class).toBe("correct_after_help");
    expect(d.draft_rev_initial).toBe(1);
    expect(d.draft_rev_final).toBe(2);
    expect(d.initial_decision).toBe("FIXTURE decision A");
    expect(d.final_decision).toBe("FIXTURE decision B");
    expect(d.interventions).toHaveLength(1);
    expect(d.interventions[0]).toMatchObject({
      evaluation_id: "ev-1",
      draft_rev: 1,
      outcome: "intervene",
      timing: "caught_before_save",
      cited: [{ entry_id: "ent-guardrail-c", revision_id: "rev-1" }],
    });
    expect(d.cited_entries).toEqual([
      { entry_id: "ent-guardrail-c", revision_id: "rev-1" },
      { entry_id: "ent-decision-a", revision_id: "rev-2" },
    ]);
    expect(d.committed).toEqual({ commit_id: "cm-1", evaluation_id: "ev-2", at_utc: at(4), escalated: false });
  });

  it("correct_unassisted: committed ok with no guidance", () => {
    const a = buildAssessment(input([draft(1, 0)], [evaluation("ev-1", 1, 1, "ok", [DECISION])], [commit("cm-1", 1, "ev-1", 2)]));
    expect(a.decisions[0].outcome_class).toBe("correct_unassisted");
    expect(a.decisions[0].interventions).toEqual([]);
    expect(a.practice_next).toEqual([]);
    expect(a.needed_help_with).toEqual([]);
  });

  it("unresolved_or_escalated: no commit", () => {
    const a = buildAssessment(input([draft(1, 0)], [evaluation("ev-1", 1, 1, "intervene", [GUARDRAIL])], []));
    expect(a.decisions[0].outcome_class).toBe("unresolved_or_escalated");
    expect(a.decisions[0].committed).toBeNull();
  });

  it("unresolved_or_escalated: saved with escalation after an uncertain review", () => {
    const ev = evaluation("ev-1", 1, 1, "uncertain", [], { escalation: { entry_id: "ent-escalate-unclear", revision_id: "rev-1" } });
    const a = buildAssessment(input([draft(1, 0)], [ev], [commit("cm-1", 1, "ev-1", 2, { escalated: true })]));
    expect(a.decisions[0].outcome_class).toBe("unresolved_or_escalated");
    expect(a.decisions[0].interventions[0]).toMatchObject({ outcome: "uncertain", escalation: { entry_id: "ent-escalate-unclear", revision_id: "rev-1" } });
    expect(a.practice_next.map(p => p.entry_id)).toEqual(["ent-escalate-unclear"]);
  });

  it("unresolved_or_escalated: an intervention discovered after save", () => {
    const a = buildAssessment(
      input([draft(1, 0)], [evaluation("ev-1", 1, 1, "ok", [DECISION]), evaluation("ev-2", 1, 5, "intervene", [GUARDRAIL])], [commit("cm-1", 1, "ev-1", 2)])
    );
    expect(a.decisions[0].outcome_class).toBe("unresolved_or_escalated");
    expect(a.decisions[0].interventions[0].timing).toBe("discovered_after_save");
  });

  it("pending and failed evaluations are neither help nor judgement; a stale one that gave guidance is help", () => {
    const evs = [
      evaluation("ev-0", 1, 0, "intervene", [GUARDRAIL], { status: "failed" }),
      evaluation("ev-1", 1, 1, "intervene", [GUARDRAIL], { status: "stale" }),
      evaluation("ev-x", 2, 2, null as unknown as string, [], { status: "pending", outcome: null }),
      evaluation("ev-2", 2, 3, "ok", [DECISION]),
    ];
    const a = buildAssessment(input([draft(1, 0), draft(2, 2)], evs, [commit("cm-1", 2, "ev-2", 4)]));
    expect(a.decisions[0].interventions.map(i => i.evaluation_id)).toEqual(["ev-1"]);
    expect(a.decisions[0].outcome_class).toBe("correct_after_help");
  });

  it("records when the voice tutor actually delivered the guidance", () => {
    const base = helped();
    const deliveries = [{ evaluation_id: "ev-1", at_utc: at(1, 45) }];
    const a = buildAssessment({ ...base, timeline: buildTimeline(base.drafts!, base.evaluations, base.commits, deliveries) });
    expect(a.decisions[0].interventions[0].delivered_at_utc).toEqual([at(1, 45)]);
  });

  it("splits decisions at commits", () => {
    const a = buildAssessment(
      input(
        [draft(1, 0), draft(2, 5)],
        [evaluation("ev-1", 1, 1, "ok", [DECISION]), evaluation("ev-2", 2, 6, "intervene", [GUARDRAIL])],
        [commit("cm-1", 1, "ev-1", 2)]
      )
    );
    expect(a.decisions.map(d => [d.draft_rev_initial, d.outcome_class])).toEqual([
      [1, "correct_unassisted"],
      [2, "unresolved_or_escalated"],
    ]);
  });
});

describe("buildAssessment — skills, help and practice", () => {
  it("practice_next comes from entries cited in interventions, with the expert's verbatim words", () => {
    const a = buildAssessment(helped());
    expect(a.practice_next).toHaveLength(1);
    const p = a.practice_next[0];
    expect(p).toMatchObject({ entry_id: "ent-guardrail-c", revision_id: "rev-1", kind: "guardrail", expert_words: GUARDRAIL_QUOTE });
    expect(p.why).toContain("decision 1");
    expect(p.suggestion).toMatch(/another unseen case/i);
    expect(a.needed_help_with.map(n => n.entry_id)).toEqual(["ent-guardrail-c"]);
  });

  it("skills_demonstrated: entries the accepted decision applied that needed no coaching", () => {
    const a = buildAssessment(helped());
    expect(a.skills_demonstrated.map(s => s.entry_id)).toEqual(["ent-decision-a"]);
    expect(a.skills_demonstrated[0].expert_words).toBe(DECISION_QUOTE);
  });

  it("an entry that needed help is never listed as demonstrated in the same decision", () => {
    const a = buildAssessment(
      input(
        [draft(1, 0), draft(2, 2)],
        [evaluation("ev-1", 1, 1, "intervene", [GUARDRAIL]), evaluation("ev-2", 2, 3, "ok", [GUARDRAIL, DECISION])],
        [commit("cm-1", 2, "ev-2", 4)]
      )
    );
    expect(a.skills_demonstrated.map(s => s.entry_id)).toEqual(["ent-decision-a"]);
  });

  it("labels an entry that is no longer taught without its words", () => {
    const withoutGuardrail = pinned.filter(e => e.entry_id !== "ent-guardrail-c");
    const a = buildAssessment({ ...helped(), knowledge: { pinned: withoutGuardrail } });
    expect(a.practice_next[0]).toMatchObject({ entry_id: "ent-guardrail-c", still_taught: false, expert_words: null, kind: null });
    expect(JSON.stringify(a)).not.toContain(GUARDRAIL_QUOTE);
    expect(a.limitations.join(" ")).toMatch(/withdrawn or changed/i);
  });
});

describe("buildAssessment — limitations and transfer", () => {
  const all: Assessment[] = [
    buildAssessment(helped()),
    buildAssessment(input([draft(1, 0)], [evaluation("ev-1", 1, 1, "ok", [DECISION])], [commit("cm-1", 1, "ev-1", 2)])),
    buildAssessment(input([draft(1, 0)], [], [])),
  ];

  it.each(all.map((a, i) => [i, a] as const))("always states the mastery disclaimer (case %i)", (_i, a) => {
    expect(a.limitations).toContain(MASTERY_DISCLAIMER);
    expect(MASTERY_DISCLAIMER).toBe("One coached correction is not proof of independent mastery.");
  });

  it("says what 'correct' means and that no answer key was used", () => {
    expect(all[0].limitations.join(" ")).toMatch(/consistent with the confirmed expert knowledge/i);
    expect(all[0].limitations.join(" ")).toMatch(/no answer key/i);
  });

  it("says transfer was not tested when there is no second case", () => {
    expect(all[0].transfer).toEqual([]);
    expect(all[0].limitations.join(" ")).toMatch(/transfer was not tested/i);
  });

  it("labels fixture-built assessments", () => {
    expect(all[0].source).toBe("fixture");
    expect(all[0].limitations.join(" ")).toMatch(/FIXTURE/);
    expect(all[0].produced_by).toEqual(ASSESSMENT_MODULE);
  });

  it("reports transfer separately: a later, reduced-help case on an entry that needed help before", () => {
    const earlier = buildAssessment(helped());
    const later = buildAssessment(
      input(
        [draft(1, 0)],
        [evaluation("ev-9", 1, 1, "ok", [GUARDRAIL, DECISION])],
        [commit("cm-9", 1, "ev-9", 2)],
        { session_id: "sess-fx-newcomer-2", earlier: [earlier], help_level: "reduced" }
      )
    );
    expect(later.decisions[0].outcome_class).toBe("correct_unassisted");
    expect(later.transfer).toHaveLength(1);
    expect(later.transfer[0]).toMatchObject({
      compared_with_session_id: "sess-fx-newcomer",
      shared_entry_ids: ["ent-guardrail-c"],
      earlier_class: "correct_after_help",
      this_class: "correct_unassisted",
      help_level: "reduced",
    });
    expect(later.transfer[0].summary).toMatch(/one further case/i);
    expect(later.limitations).toContain(MASTERY_DISCLAIMER);
    expect(later.limitations.join(" ")).not.toMatch(/transfer was not tested/i);
  });

  it("ignores the same session passed as 'earlier'", () => {
    const a = buildAssessment(helped());
    expect(buildAssessment({ ...helped(), earlier: [a] }).transfer).toEqual([]);
  });
});

describe("renderAssessmentMarkdown", () => {
  const md = renderAssessmentMarkdown(buildAssessment(helped()));

  it("states what happened, what needed help and what to practise next", () => {
    expect(md).toContain("# Learning assessment");
    expect(md).toContain("sess-fx-newcomer");
    expect(md).toContain("Correct after help");
    expect(md).toContain("## What needed help");
    expect(md).toContain("## What to practise next");
    expect(md).toContain(GUARDRAIL_QUOTE);
    expect(md).toContain("caught before save");
    expect(md).toContain("FIXTURE");
  });

  it("never claims mastery: the only mention is the disclaimer", () => {
    const mentions = md.match(/master/gi) ?? [];
    expect(mentions).toHaveLength(1);
    expect(md).toContain(MASTERY_DISCLAIMER);
  });

  it("is not a knowledge entry", () => {
    expect(md).not.toMatch(/^schema_version:/m);
    expect(md).not.toContain("ws5.v0");
  });
});
