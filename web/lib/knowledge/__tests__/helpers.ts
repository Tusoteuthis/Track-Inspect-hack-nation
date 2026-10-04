import { loadWs5Fixtures } from "@/fixtures/ws5/load";
import { isTeachable, type EligibilityContext, type KnowledgeCandidate } from "../eligibility";
import type { EvaluationKnowledge, Judge, JudgeInput, JudgeVerdict } from "../evaluation-types";

export const fx = loadWs5Fixtures();

export const ctx: EligibilityContext = {
  current_revision_by_entry: fx.current_revision_by_entry,
  exchanges: fx.exchanges,
  events: fx.events,
  allow_fixture: true,
};

/** What WS6 would pin for a newcomer session: the teachable candidates only. */
export const eligibleCandidates: KnowledgeCandidate[] = fx.candidates.filter(c => isTeachable(c, ctx).ok);

export const knowledge = (candidates: KnowledgeCandidate[] = eligibleCandidates): EvaluationKnowledge => ({ candidates, ctx });

export const verdict = (overrides: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
  outcome: "ok",
  citations: [],
  guiding_question: "What do you notice on the second channel compared with the upper channel?",
  explanation: "",
  uncertainty: null,
  escalation_entry_id: null,
  missing_context: null,
  ...overrides,
});

/** A mock judge returning a fixed verdict (or one computed from the input), recording every input. */
export function scriptedJudge(answer: JudgeVerdict | ((input: JudgeInput) => JudgeVerdict)): Judge & { inputs: JudgeInput[] } {
  const inputs: JudgeInput[] = [];
  return {
    name: "mock",
    inputs,
    async judge(input) {
      inputs.push(structuredClone(input));
      return typeof answer === "function" ? answer(input) : answer;
    },
  };
}

export const GUARDRAIL_QUOTE = "never save FIXTURE decision A when FIXTURE condition C is present on the second channel.";
export const DECISION_QUOTE = "FIXTURE decision A needs FIXTURE cue B and FIXTURE cue D.";
export const ESCALATION_QUOTE =
  "when I can't tell region A apart, I escalate to a senior engineer instead of saving a decision.";
