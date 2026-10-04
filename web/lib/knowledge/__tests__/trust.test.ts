// Trust propagation (Sprint 4, Lane D): revocation, corrections, dependents of removed evidence,
// off-record material across every output path, and records that must never teach.

import { describe, expect, it } from "vitest";
import { OFF_RECORD_MARKERS } from "@/fixtures/ws5/synthesis/load";
import { buildAssessment, renderAssessmentMarkdown } from "../assessment";
import { buildExpertScenario, candidateOf, confirmRevision, createStandInJudge, loadUnseenCase, revokeRevision, withRevision } from "../dev/scenario";
import { isTeachable, selectEligible, type KnowledgeCandidate } from "../eligibility";
import { evaluate } from "../evaluate";
import { parseEntryMarkdown } from "../markdown";
import { IneligibleKnowledgeError, retrieve } from "../retrieve";
import { renderEntryMarkdown } from "../markdown";
import { renderWorkflowMarkdown } from "../synthesize";
import { buildTimeline } from "../timeline";
import { buildEvaluationContextBlock, buildKnowledgeChangedBlock, TutorContextError } from "../tutor-context";
import { buildWorkMap } from "../workmap";
import { checkPinnedKnowledge, flagDependents } from "../trust";
import { scriptedJudge, verdict } from "./helpers";
import { ctx as fxCtx, fx } from "./helpers";

const unseen = loadUnseenCase();
const refs = (pinned: readonly { entry_id: string; revision_id: string }[]) => pinned.map(p => ({ entry_id: p.entry_id, revision_id: p.revision_id }));

describe("revocation", () => {
  const s = buildExpertScenario();
  const pinned = selectEligible(s.candidates, s.ctx).pinned;
  const guardrail = pinned.find(e => e.entry_id === "ent-evt-001-guardrail")!;
  const revoked = revokeRevision(guardrail, "expert withdrew it", "2026-10-04T11:00:00.000Z");
  const after = withRevision(s.candidates, revoked);

  it("the scenario pins the confirmed guardrail first (precondition)", () => {
    expect(guardrail.status).toBe("confirmed");
    expect(checkPinnedKnowledge(refs(pinned), s.candidates, s.ctx)).toEqual({ status: "current" });
  });

  it("removes the entry from selectEligible", () => {
    const { pinned: now, excluded } = selectEligible(after, s.ctx);
    expect(now.map(e => e.entry_id)).not.toContain("ent-evt-001-guardrail");
    expect(excluded).toContainEqual(expect.objectContaining({ entry_id: "ent-evt-001-guardrail", reason: "revoked" }));
  });

  it("a session pinned to it gets knowledge_changed", () => {
    expect(checkPinnedKnowledge(refs(pinned), after, s.ctx)).toEqual({
      status: "knowledge_changed",
      changed: [{ entry_id: "ent-evt-001-guardrail", revision_id: "rev-1", reason: "revoked", detail: "expert withdrew it" }],
    });
  });

  it("evaluating with the stale pin is refused; the re-pinned evaluation never cites it", async () => {
    const draft = { draft_rev: 1, ...unseen.drafts[0], visual_context: null };
    await expect(evaluate({ draft, case_view: unseen.case_view, knowledge: { candidates: after, ctx: s.ctx } }, createStandInJudge(["intervene"]))).rejects.toThrow(
      IneligibleKnowledgeError
    );
    const repinned = after.filter(c => isTeachable(c, s.ctx).ok);
    const r = await evaluate({ draft, case_view: unseen.case_view, knowledge: { candidates: repinned, ctx: s.ctx } }, createStandInJudge(["intervene"]));
    expect(r.cited.map(c => c.entry_id)).not.toContain("ent-evt-001-guardrail");
    expect(r.feedback_text).not.toContain("never save FIXTURE decision A when FIXTURE condition C");
  });

  it("the tutor context block for an earlier evaluation that cited it is refused, and the tutor is told to drop it", () => {
    const evaluation = {
      outcome: "intervene" as const,
      cited: [{ entry_id: guardrail.entry_id, revision_id: "rev-1", exchange_ids: ["sx-002"], quote: guardrail.expert_words[0].quote }],
      guiding_question: "What do you see?",
      uncertainty: null,
      escalation: null,
      evidence: [],
    };
    expect(() => buildEvaluationContextBlock({ evaluation_id: "ev-1", draft_rev: 1, evaluation, knowledge: { candidates: s.candidates, ctx: s.ctx }, screen: null })).not.toThrow();
    expect(() => buildEvaluationContextBlock({ evaluation_id: "ev-1", draft_rev: 1, evaluation, knowledge: { candidates: after, ctx: s.ctx }, screen: null })).toThrow(TutorContextError);
    const pin = checkPinnedKnowledge(refs(pinned), after, s.ctx);
    const block = buildKnowledgeChangedBlock({ session_id: "sess-1", withdrawn: pin.status === "knowledge_changed" ? pin.changed : [] });
    expect(block.text).toContain("ent-evt-001-guardrail");
    expect(block.text).not.toContain(guardrail.expert_words[0].quote);
  });

  it("an expert correction (new current revision) also reports knowledge_changed as superseded", () => {
    const step1 = s.candidates.find(c => c.entry.entry_id === "ent-evt-001-step" && c.entry.revision_id === "rev-1")!;
    // A session that pinned rev-1 before the correction moved current.json to rev-2.
    expect(checkPinnedKnowledge([{ entry_id: "ent-evt-001-step", revision_id: "rev-1" }], s.candidates, s.ctx)).toEqual({
      status: "knowledge_changed",
      changed: [expect.objectContaining({ entry_id: "ent-evt-001-step", revision_id: "rev-1", reason: expect.stringMatching(/not_confirmed|superseded/) })],
    });
    expect(isTeachable(step1, s.ctx).ok).toBe(false);
  });

  it("a pinned revision missing from the store is knowledge_changed, not silently kept", () => {
    expect(checkPinnedKnowledge([{ entry_id: "ent-gone", revision_id: "rev-1" }], s.candidates, s.ctx)).toEqual({
      status: "knowledge_changed",
      changed: [{ entry_id: "ent-gone", revision_id: "rev-1", reason: "missing", detail: "revision not in the store" }],
    });
  });
});

describe("dependents of revoked or deleted evidence are flagged", () => {
  it("entries sharing an exchange or event with a revoked entry", () => {
    const flags = flagDependents({ candidates: fx.candidates, revoked: [{ entry_id: "ent-revoked-a", revision_id: "rev-1" }] });
    // ent-revoked-a quotes exc-002 on evt-001; ent-decision-a quotes exc-002 too, ent-step-a shares evt-001.
    expect(flags).toContainEqual({ entry_id: "ent-decision-a", revision_id: "rev-2", reason: "shares_exchange", via: ["exc-002"] });
    expect(flags).toContainEqual(expect.objectContaining({ entry_id: "ent-step-a", revision_id: "rev-1", reason: "shares_event", via: ["evt-001"] }));
    expect(flags.map(f => f.entry_id)).not.toContain("ent-revoked-a");
  });

  it("only current revisions are flagged when the current pointers are given", () => {
    const flags = flagDependents({ candidates: fx.candidates, revoked: [{ entry_id: "ent-revoked-a", revision_id: "rev-1" }], current_revision_by_entry: fxCtx.current_revision_by_entry });
    expect(flags.find(f => f.entry_id === "ent-decision-a" && f.revision_id === "rev-1")).toBeUndefined();
  });

  it("entries whose evidence was deleted, and they stop teaching", () => {
    const flags = flagDependents({ candidates: fx.candidates, revoked: [], deleted_exchange_ids: ["exc-003"], deleted_event_ids: [] });
    expect(flags).toEqual([{ entry_id: "ent-guardrail-c", revision_id: "rev-1", reason: "evidence_deleted", via: ["exc-003"] }]);
    const withoutExchange = { ...fxCtx, exchanges: fxCtx.exchanges.filter(x => x.exchange_id !== "exc-003") };
    const guardrail = fx.candidates.find(c => c.entry.entry_id === "ent-guardrail-c")!;
    expect(isTeachable(guardrail, withoutExchange)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("a deleted event flags every entry that shows it", () => {
    const flags = flagDependents({ candidates: fx.candidates, revoked: [], deleted_event_ids: ["evt-002"] });
    expect(flags.map(f => f.entry_id).sort()).toEqual(["ent-guardrail-c", "ent-unresolved-b"]);
  });
});

describe("off-record never reaches any output path", () => {
  // The scenario's sx-006 (off-record gesture) and sx-007 (off-record exchange) carry markers; the
  // Sprint 1 fixtures' exc-008 carries "off-record remark about region E".
  const MARKERS = [...OFF_RECORD_MARKERS, "off-record remark about region E"];
  const leaks = (label: string, text: string) => MARKERS.filter(m => text.includes(m)).map(m => `${label}: ${m}`);

  it("walks synthesis → work map → eligibility → retrieval → evaluation → tutor context → assessment", async () => {
    const found: string[] = [];
    const s = buildExpertScenario();

    // Synthesis (entries, workflow, gaps, teach-back) and the Work Map.
    for (const run of [s.run1, s.run2]) {
      found.push(...leaks("synthesis", JSON.stringify(run)));
      found.push(...leaks("workflow.md", renderWorkflowMarkdown(run.workflow)));
      run.entries.forEach(e => found.push(...leaks(`entry ${e.entry_id}`, renderEntryMarkdown(e))));
    }
    const revisions = s.candidates.map(c => c.entry);
    const events = s.ctx.events;
    found.push(...leaks("workmap", JSON.stringify(buildWorkMap({ workflow: s.run2.workflow, revisions, events, exchanges: s.exchanges, include_draft: true }))));

    // Eligibility and retrieval, with a query that names the off-record words.
    const { pinned } = selectEligible(s.candidates, s.ctx);
    found.push(...leaks("pinned", JSON.stringify(pinned)));
    const hits = retrieve({
      knowledge: pinned,
      query: { decision: "OFFRECORD-MARKER-SX7", reason: "OFFRECORD-MARKER-EVT5 private remark", visual_context: null, case_observations: unseen.case_view.visible_context },
      limit: 20,
      ctx: s.ctx,
    });
    found.push(...leaks("retrieval", JSON.stringify(hits.map(h => pinned.find(p => p.entry_id === h.entry_id)))));

    // Evaluation: a judge that tries to cite the off-record words gets them stripped.
    const judge = scriptedJudge(input =>
      verdict({
        outcome: "intervene",
        citations: [{ entry_id: input.knowledge[0].entry_id, quote: "OFFRECORD-MARKER-SX7 private remark." }],
        explanation: 'The expert said "OFFRECORD-MARKER-SX7 private remark."',
      })
    );
    const draft = { draft_rev: 1, ...unseen.drafts[0], visual_context: null };
    const ev = await evaluate({ draft, case_view: unseen.case_view, knowledge: { candidates: s.candidates.filter(c => isTeachable(c, s.ctx).ok), ctx: s.ctx } }, judge);
    found.push(...leaks("judge input", JSON.stringify(judge.inputs)));
    found.push(...leaks("evaluation", JSON.stringify(ev)));

    // Tutor context block from that evaluation.
    const block = buildEvaluationContextBlock({ evaluation_id: "ev-1", draft_rev: 1, evaluation: ev, knowledge: { candidates: s.candidates, ctx: s.ctx }, screen: null });
    found.push(...leaks("tutor context", block.text));

    // Assessment, even when a (forged) evaluation cites an off-record entry.
    const forged = { entry_id: "ent-offrecord-e", revision_id: "rev-1", exchange_ids: ["exc-008"], quote: "off-record remark about region E." };
    const evaluations = [
      { evaluation_id: "ev-1", draft_rev: 1, status: "done" as const, outcome: "intervene", cited: [...ev.cited, forged], escalation: null, created_at_utc: "2026-10-04T10:01:00.000Z", updated_at_utc: "2026-10-04T10:01:00.000Z" },
    ];
    const drafts = [{ draft_rev: 1, decision: draft.decision, reason: draft.reason, updated_at_utc: "2026-10-04T10:00:00.000Z" }];
    const a = buildAssessment({ session_id: "sess-1", timeline: buildTimeline(drafts, evaluations, []), evaluations, commits: [], drafts, knowledge: { pinned }, source: "fixture", created_at_utc: "2026-10-04T10:05:00.000Z" });
    found.push(...leaks("assessment", JSON.stringify(a)));
    found.push(...leaks("assessment.md", renderAssessmentMarkdown(a)));

    // The walk really covered the off-record material (precondition), and nothing leaked.
    expect(JSON.stringify(s.exchanges)).toContain("OFFRECORD-MARKER-SX7");
    expect(found).toEqual([]);
  });

  it("an off-record tutor context citation is refused outright", () => {
    const evaluation = {
      outcome: "intervene" as const,
      cited: [{ entry_id: "ent-offrecord-e", revision_id: "rev-1", exchange_ids: ["exc-008"], quote: "off-record remark about region E." }],
      guiding_question: "What do you see?",
      uncertainty: null,
      escalation: null,
      evidence: [],
    };
    expect(() => buildEvaluationContextBlock({ evaluation_id: "ev-1", draft_rev: 1, evaluation, knowledge: { candidates: fx.candidates, ctx: fxCtx }, screen: null })).toThrow(
      /off_record_evidence/
    );
  });
});

describe("records that never teach", () => {
  const entry = fx.candidates.find(c => c.entry.entry_id === "ent-guardrail-c")!.entry;
  const assessmentMd = renderAssessmentMarkdown(
    buildAssessment({ session_id: "sess-1", timeline: [], evaluations: [], commits: [], knowledge: { pinned: [] }, source: "fixture", created_at_utc: "2026-10-04T10:00:00.000Z" })
  );

  it.each<[string, KnowledgeCandidate]>([
    ["an assessment record", { record_type: "assessment", path: "knowledge/assessments/sess-1.json", entry }],
    ["an assessment stored as a knowledge entry", { record_type: "knowledge_entry", path: "knowledge/assessments/entries/ent-guardrail-c/rev-1.md", entry }],
    ["evaluator notes", { record_type: "evaluator_notes", path: "cases/evaluator/fx-case-201.json", entry }],
    ["evaluator notes at an entry path", { record_type: "knowledge_entry", path: "evaluator/entries/ent-guardrail-c/rev-1.md", entry }],
    ["a learner record", { record_type: "knowledge_entry", path: "knowledge/learner/entries/ent-guardrail-c/rev-1.md", entry }],
  ])("%s is not knowledge", (_label, candidate) => {
    expect(isTeachable(candidate, fxCtx)).toMatchObject({ ok: false, reason: "not_knowledge" });
    expect(selectEligible([candidate], fxCtx).pinned).toEqual([]);
  });

  it("an assessment's Markdown cannot be parsed into a knowledge entry", () => {
    expect(() => parseEntryMarkdown(assessmentMd)).toThrow();
  });

  it("a confirmed copy is still refused under an assessments path", () => {
    const c = candidateOf(confirmRevision({ ...entry, status: "draft", confirmation: null }, { confirmation_id: "cnf-x", expert_response_exchange_id: "exc-003" }));
    expect(isTeachable({ ...c, path: "knowledge/assessments/x.md" }, fxCtx)).toMatchObject({ ok: false, reason: "not_knowledge" });
  });
});
