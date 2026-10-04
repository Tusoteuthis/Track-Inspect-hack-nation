import { describe, expect, it } from "vitest";
import type { Evaluation, LearnerDraft } from "@/lib/contracts";
import { canCommit, DEFAULT_OUTCOME_POLICY, loadOutcomePolicy, type CommitState, type OutcomePolicy } from "./commit-policy";

const draft = (rev = 2): LearnerDraft => ({
  session_id: "ses-1",
  draft_rev: rev,
  decision: "d",
  reason: "r",
  visual_context: [],
  updated_at_utc: "2026-10-04T10:00:00.000Z",
  source: "fixture",
});

const evaluation = (over: Partial<Evaluation> = {}): Evaluation => ({
  evaluation_id: "evl-1",
  session_id: "ses-1",
  draft_rev: 2,
  knowledge_revision_ids: ["rev-a"],
  status: "done",
  outcome: "ok",
  cited: [],
  feedback_text: "f",
  created_at_utc: "2026-10-04T10:00:01.000Z",
  updated_at_utc: "2026-10-04T10:00:02.000Z",
  produced_by: { module: "m", version: "1", source: "stub" },
  ...over,
});

const state = (over: Partial<CommitState> = {}): CommitState => ({
  draft: draft(),
  latestEvaluation: evaluation(),
  requestDraftRev: 2,
  pinnedRevisionIds: ["rev-a"],
  pinnedKnowledgeCurrent: true,
  committed: false,
  escalated: false,
  ...over,
});

const codeOf = (s: CommitState, p: OutcomePolicy = DEFAULT_OUTCOME_POLICY) => {
  const r = canCommit(s, p);
  return r.ok ? "ok" : r.code;
};

describe("canCommit", () => {
  it("allows a done, current, ok evaluation", () => {
    expect(canCommit(state(), DEFAULT_OUTCOME_POLICY)).toEqual({ ok: true, escalated: false });
  });

  it.each<[string, Partial<CommitState>, string]>([
    ["already committed (wins over everything)", { committed: true, latestEvaluation: null }, "already_committed"],
    ["no draft", { draft: null }, "evaluation_required"],
    ["no evaluation", { latestEvaluation: null }, "evaluation_required"],
    ["failed evaluation", { latestEvaluation: evaluation({ status: "failed", outcome: null }) }, "evaluation_required"],
    ["pending evaluation", { latestEvaluation: evaluation({ status: "pending", outcome: null }) }, "evaluation_pending"],
    ["evaluation for an older draft_rev", { latestEvaluation: evaluation({ draft_rev: 1 }) }, "evaluation_stale"],
    ["request names an older draft_rev", { requestDraftRev: 1 }, "evaluation_stale"],
    ["edit after evaluation (stale: draft_changed)", { latestEvaluation: evaluation({ status: "stale", stale_reason: "draft_changed" }) }, "evaluation_stale"],
    ["stale for knowledge", { latestEvaluation: evaluation({ status: "stale", stale_reason: "knowledge_changed" }) }, "knowledge_changed"],
    ["pinned knowledge revised/revoked", { pinnedKnowledgeCurrent: false }, "knowledge_changed"],
    ["evaluation used other knowledge than the pins", { pinnedRevisionIds: ["rev-b"] }, "knowledge_changed"],
    ["outcome intervene", { latestEvaluation: evaluation({ outcome: "intervene" }) }, "blocked_by_outcome"],
    ["outcome uncertain without escalation", { latestEvaluation: evaluation({ outcome: "uncertain" }) }, "blocked_by_outcome"],
    ["unknown outcome (fail closed)", { latestEvaluation: evaluation({ outcome: "maybe" }) }, "blocked_by_outcome"],
    ["done without an outcome", { latestEvaluation: evaluation({ outcome: null }) }, "blocked_by_outcome"],
  ])("rejects: %s", (_name, over, code) => {
    expect(codeOf(state(over))).toBe(code);
  });

  it("uncertain + escalated → allowed and recorded as escalated", () => {
    expect(canCommit(state({ latestEvaluation: evaluation({ outcome: "uncertain" }), escalated: true }), DEFAULT_OUTCOME_POLICY)).toEqual({
      ok: true,
      escalated: true,
    });
  });

  it("an ok outcome never records an escalation, even if the client asked for one", () => {
    expect(canCommit(state({ escalated: true }), DEFAULT_OUTCOME_POLICY)).toEqual({ ok: true, escalated: false });
  });

  it("knowledge pin order does not matter", () => {
    expect(codeOf(state({ pinnedRevisionIds: ["rev-b", "rev-a"], latestEvaluation: evaluation({ knowledge_revision_ids: ["rev-a", "rev-b"] }) }))).toBe("ok");
  });

  it("returns details the UI can explain", () => {
    const r = canCommit(state({ latestEvaluation: evaluation({ outcome: "intervene" }) }), DEFAULT_OUTCOME_POLICY);
    expect(r).toEqual({ ok: false, code: "blocked_by_outcome", details: { outcome: "intervene", consequence: "block", evaluation_id: "evl-1" } });
    const u = canCommit(state({ latestEvaluation: evaluation({ outcome: "uncertain" }) }), DEFAULT_OUTCOME_POLICY);
    expect(u).toMatchObject({ ok: false, code: "blocked_by_outcome", details: { consequence: "allow_with_escalation", requires: "escalated" } });
  });

  it("follows the policy table it is given", () => {
    const strict: OutcomePolicy = { outcomes: { ok: "allow", intervene: "block", uncertain: "block" } };
    expect(codeOf(state({ latestEvaluation: evaluation({ outcome: "uncertain" }), escalated: true }), strict)).toBe("blocked_by_outcome");
  });
});

describe("outcome-policy.json", () => {
  it("is the default table, marked pending WS5 agreement", () => {
    const p = loadOutcomePolicy();
    expect(p.outcomes).toEqual({ ok: "allow", intervene: "block", uncertain: "allow_with_escalation" });
    expect(p.status).toBe("pending WS5 agreement");
  });
});
