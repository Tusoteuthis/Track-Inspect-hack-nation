// D1 (a): the judge as a server-side Claude call with structured JSON output. It is one step
// inside evaluate(); the deterministic guards around it decide what reaches the learner.
// Server-only: needs ANTHROPIC_API_KEY (or another credential the SDK resolves).

import Anthropic from "@anthropic-ai/sdk";
import { EVALUATION_OUTCOMES, JudgeError, type Judge, type JudgeInput, type JudgeVerdict } from "./evaluation-types";

export const DEFAULT_JUDGE_MODEL = "claude-opus-5-5";

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "citations", "guiding_question", "explanation", "uncertainty", "escalation_entry_id", "missing_context"],
  properties: {
    outcome: { type: "string", enum: [...EVALUATION_OUTCOMES] },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entry_id", "quote"],
        properties: { entry_id: { type: "string" }, quote: { type: "string" } },
      },
    },
    guiding_question: { type: "string" },
    explanation: { type: "string" },
    uncertainty: { type: "string" },
    escalation_entry_id: { type: "string" },
    missing_context: { type: "string" },
  },
} as const;

export const JUDGE_SYSTEM_PROMPT = `You are the evaluator inside a tutor for newcomers who review railway sensor traces on a screen.
A newcomer has drafted a decision and a reason for a trace. Before the draft may be saved, you decide whether it is consistent with the expert knowledge you are given.

You receive JSON with:
- "draft": the newcomer's decision, reason, and what they are looking at.
- "visible_case": the facts the newcomer can see on this trace. Treat them as true.
- "knowledge": the only expert knowledge that exists. Each item has an entry_id, a kind (step, decision, guardrail, exception, escalation), "expert_quotes" (the expert's exact words), "process_summary" (AI wording, not the expert's words), exceptions and qualifiers.

Decide one outcome:
- "intervene": the draft contradicts the knowledge for this visible case — it breaks a guardrail, ignores a condition the expert requires, or its reason does not match the conditions the expert gave (even if the decision itself might be right).
- "ok": the decision and its reason are consistent with the knowledge for this visible case, and no guardrail applies against it.
- "uncertain": the knowledge does not cover this case well enough to judge. Never fill the gap with your own domain knowledge.

Rules:
1. You know nothing about railways beyond the knowledge items. Do not use outside knowledge, and never invent a rule, threshold, or meaning.
2. Every citation copies a span of one item's "expert_quotes" character for character (same case, punctuation, and words; at least three words) and names that item's entry_id. Cite what your outcome rests on. For "intervene", cite the guardrail or condition that is broken. For "ok", cite the step or decision the draft follows.
3. "guiding_question": one question that makes the newcomer look again at the relevant part of the trace before being told the answer, e.g. "What do you notice on ... compared with ...?". Do not give the answer away in it, and do not put quotation marks in it.
4. "explanation": one or two plain sentences, in your own words, saying why. Do not use quotation marks unless you copy a span that you also cite.
5. For "uncertain": set "uncertainty" to why the knowledge does not settle the case. If an item of kind "escalation" applies to this situation, set "escalation_entry_id" to its entry_id. Otherwise set "missing_context" to what the newcomer should look for or ask a senior engineer about.
6. Use an empty string for any field that does not apply.`;

function str(v: unknown, field: string): string {
  if (typeof v !== "string") throw new JudgeError(`judge output: ${field} must be a string`);
  return v;
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** Validates the structured output; we never trust it blindly even with a schema. */
export function parseVerdict(raw: unknown): JudgeVerdict {
  if (typeof raw !== "object" || raw === null) throw new JudgeError("judge output is not an object");
  const o = raw as Record<string, unknown>;
  const outcome = str(o.outcome, "outcome");
  if (!(EVALUATION_OUTCOMES as readonly string[]).includes(outcome)) throw new JudgeError(`judge output: unknown outcome "${outcome}"`);
  if (!Array.isArray(o.citations)) throw new JudgeError("judge output: citations must be an array");
  return {
    outcome: outcome as JudgeVerdict["outcome"],
    citations: o.citations.map((c, i) => {
      const r = (c ?? {}) as Record<string, unknown>;
      return { entry_id: str(r.entry_id, `citations[${i}].entry_id`), quote: str(r.quote, `citations[${i}].quote`) };
    }),
    guiding_question: str(o.guiding_question, "guiding_question"),
    explanation: str(o.explanation, "explanation"),
    uncertainty: orNull(str(o.uncertainty, "uncertainty")),
    escalation_entry_id: orNull(str(o.escalation_entry_id, "escalation_entry_id")),
    missing_context: orNull(str(o.missing_context, "missing_context")),
  };
}

export type AnthropicJudgeOptions = {
  client?: Anthropic;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

export function createAnthropicJudge(options: AnthropicJudgeOptions = {}): Judge {
  const model = options.model ?? DEFAULT_JUDGE_MODEL;
  // The save gate deserves careful judgement; Opus 5.5 defaults to "medium", so set it explicitly.
  const effort = options.effort ?? "high";
  let client = options.client;

  return {
    name: `anthropic:${model}`,
    async judge(input: JudgeInput): Promise<JudgeVerdict> {
      client ??= new Anthropic();
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort, format: { type: "json_schema", schema: VERDICT_SCHEMA } },
          system: JUDGE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
        });
      } catch (err) {
        throw new JudgeError(`Claude request failed: ${err instanceof Error ? err.message : String(err)}`, err);
      }
      if (response.stop_reason === "refusal") throw new JudgeError("Claude declined to evaluate this draft", response.stop_details);
      if (response.stop_reason === "max_tokens") throw new JudgeError("judge output was truncated");
      const text = response.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new JudgeError("judge output is not valid JSON");
      }
      return parseVerdict(raw);
    },
  };
}
