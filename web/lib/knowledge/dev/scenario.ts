// DEV ONLY: the expert → newcomer scenario shared by dev/e2e-ws5.mts and the trust tests. It runs
// the real WS5 modules on the FIXTURE synthesis scenario. The pieces that belong to partners and
// are not merged (WS6 confirmation storage and commit guard, the LLM judge without a key) are
// labelled stand-ins here and must never be imported by runtime code.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpertExchange } from "@/lib/expert/contracts";
import { fixtureImageRef, loadSynthesisScenario, SYNTHESIS_FIXTURES_DIR } from "@/fixtures/ws5/synthesis/load";
import type { EligibilityContext, KnowledgeCandidate } from "../eligibility";
import type { EvaluationOutcome, Judge, JudgeInput, JudgeVerdict, TutorEvaluation } from "../evaluation-types";
import { tokenize } from "../retrieve";
import type { KnowledgeEntryContent } from "../schema";
import { nextStatus } from "../status";
import { synthesize } from "../synthesize";
import type { SynthesisOutput } from "../synthesis-types";

export const E2E_FIXTURES_DIR = join(SYNTHESIS_FIXTURES_DIR, "..", "e2e");
const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(E2E_FIXTURES_DIR, name), "utf8")) as T;

export type UnseenCase = {
  source: "fixture";
  shown_to_expert: boolean;
  case_view: { case_id: string; title: string; visible_context: string[]; source: "fixture" };
  learner_region: { frame_id: string; coordinate_space: "original_frame_normalized"; x: number; y: number; width: number; height: number; mapping_status: string };
  frame_size: { width_px: number; height_px: number };
  drafts: { decision: string; reason: string }[];
};

export const loadUnseenCase = () => readJson<UnseenCase>("unseen-case.json");

/** WS6 stand-in: a confirmation binds to the exact revision reviewed and promotes it to confirmed. */
export function confirmRevision(entry: KnowledgeEntryContent, c: { confirmation_id: string; expert_response_exchange_id: string }): KnowledgeEntryContent {
  const t = nextStatus(entry.status, { type: "confirmation", result: "confirmed" });
  if (!t.ok) throw new Error(t.message);
  return {
    ...structuredClone(entry),
    status: t.status,
    confirmation: { confirmation_id: c.confirmation_id, revision_id_reviewed: entry.revision_id, result: "confirmed", expert_response_exchange_id: c.expert_response_exchange_id },
  };
}

/** WS6 stand-in for POST /api/knowledge/entries/:id/revoke: the status WS6 reports for the revision. */
export function revokeRevision(entry: KnowledgeEntryContent, reason: string, at_utc: string): KnowledgeEntryContent {
  const t = nextStatus(entry.status, { type: "revoke" });
  if (!t.ok) throw new Error(t.message);
  return { ...structuredClone(entry), status: t.status, revoked_at_utc: at_utc, revoked_reason: reason };
}

export const candidateOf = (entry: KnowledgeEntryContent): KnowledgeCandidate => ({
  record_type: "knowledge_entry",
  path: `entries/${entry.entry_id}/${entry.revision_id}.md`,
  entry,
});

export type ExpertScenario = {
  exchanges: ExpertExchange[];
  run1: SynthesisOutput;
  run2: SynthesisOutput;
  /** Every stored revision, with the teach-back revisions confirmed. */
  candidates: KnowledgeCandidate[];
  ctx: EligibilityContext;
  confirmation: { confirmation_id: string; expert_response_exchange_id: string };
};

/**
 * Expert side: synthesis of the live session + debrief (run 1), the expert's teach-back
 * correction (run 2), then the expert confirms the run-2 teach-back (FIXTURE exchange sx-011).
 */
export function buildExpertScenario(): ExpertScenario {
  const s = loadSynthesisScenario();
  const confirmExchange = readJson<ExpertExchange>("sx-011-confirm.json");
  const cnf = readJson<{ confirmation_id: string; expert_response_exchange_id: string }>("cnf-sx-002.json");
  const exchanges = [...s.exchanges, confirmExchange];
  const base = { events: s.events, exchanges: s.exchanges, resolve_image_ref: fixtureImageRef };
  const run1 = synthesize({ ...base, confirmations: [], prior: [] });
  const run2 = synthesize({ ...base, confirmations: [s.correction], prior: run1.entries });
  if (!run2.teach_back) throw new Error("run 2 produced no teach-back");

  const reviewed = new Set(run2.teach_back.reviewed.map(r => `${r.entry_id}@${r.revision_id}`));
  const confirmation = { confirmation_id: cnf.confirmation_id, expert_response_exchange_id: cnf.expert_response_exchange_id };
  const revisions = [...run1.entries, ...run2.entries].map(e => (reviewed.has(`${e.entry_id}@${e.revision_id}`) ? confirmRevision(e, confirmation) : e));
  const current: Record<string, string> = {};
  for (const e of revisions) {
    const no = Number(e.revision_id.slice(4));
    if (!current[e.entry_id] || Number(current[e.entry_id].slice(4)) < no) current[e.entry_id] = e.revision_id;
  }
  return {
    exchanges,
    run1,
    run2,
    candidates: revisions.map(candidateOf),
    ctx: { current_revision_by_entry: current, exchanges, events: s.events, allow_fixture: true },
    confirmation,
  };
}

/** Replace one revision in a candidate list (e.g. after a revocation). */
export const withRevision = (candidates: readonly KnowledgeCandidate[], entry: KnowledgeEntryContent): KnowledgeCandidate[] =>
  candidates.map(c => (c.entry.entry_id === entry.entry_id && c.entry.revision_id === entry.revision_id ? candidateOf(entry) : c));

/**
 * STAND-IN JUDGE, used only when ANTHROPIC_API_KEY is missing. The outcome per call is scripted
 * (it never reads the draft, like WS7's fixture evaluator); the citation is the retrieved entry of
 * the right kind with the most word overlap with the visible case. Every guard around it is real:
 * eligibility, retrieval, verbatim and citation checks, feedback composition.
 */
export function createStandInJudge(script: readonly EvaluationOutcome[]): Judge & { calls: JudgeInput[] } {
  const calls: JudgeInput[] = [];
  return {
    name: "stand-in:scripted (no ANTHROPIC_API_KEY)",
    calls,
    async judge(input): Promise<JudgeVerdict> {
      const outcome = script[Math.min(calls.length, script.length - 1)];
      calls.push(input);
      const visible = tokenize(input.visible_case.join(" "));
      const overlap = (quote: string) => [...tokenize(quote)].filter(t => visible.has(t)).length;
      const best = input.knowledge
        .filter(k => k.kind === "guardrail" && k.expert_quotes.length)
        .map(k => ({ k, quote: [...k.expert_quotes].sort((a, b) => overlap(b) - overlap(a))[0] }))
        .sort((a, b) => overlap(b.quote) - overlap(a.quote))[0];
      const citations = best ? [{ entry_id: best.k.entry_id, quote: best.quote }] : [];
      return {
        outcome,
        citations,
        guiding_question:
          outcome === "ok"
            ? "What on this trace made you change your decision?"
            : "Before you save, look at the whole trace again: is there anything the expert said you must check first?",
        explanation: outcome === "ok" ? "Your reason now follows what the expert said." : "The expert gave a rule that applies to what is visible here.",
        uncertainty: null,
        escalation_entry_id: null,
        missing_context: null,
      };
    },
  };
}

/**
 * WS6 commit-guard STAND-IN (the real guard is server-side, WS6 Sprint 3). Mirrors the documented
 * policy: a commit needs a done evaluation of the current draft revision against current pinned
 * knowledge, and outcome ok (intervene always blocks; uncertain only with escalation).
 */
export function commitStandIn(input: {
  evaluation: Pick<TutorEvaluation, "outcome"> & { draft_rev: number; status: "done" | "pending" | "failed" | "stale" } | null;
  current_draft_rev: number;
  knowledge_current: boolean;
  escalated?: boolean;
}): { ok: true } | { ok: false; code: string } {
  const e = input.evaluation;
  if (!e) return { ok: false, code: "evaluation_required" };
  if (e.status === "pending") return { ok: false, code: "evaluation_pending" };
  if (e.status !== "done") return { ok: false, code: "evaluation_stale" };
  if (e.draft_rev !== input.current_draft_rev) return { ok: false, code: "evaluation_stale (draft_changed)" };
  if (!input.knowledge_current) return { ok: false, code: "evaluation_stale (knowledge_changed)" };
  if (e.outcome === "ok") return { ok: true };
  if (e.outcome === "uncertain" && input.escalated) return { ok: true };
  return { ok: false, code: "commit_blocked (blocked_by_outcome)" };
}
