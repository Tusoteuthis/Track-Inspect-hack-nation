import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { JudgeError, type JudgeInput } from "../evaluation-types";
import { createAnthropicJudge, DEFAULT_JUDGE_MODEL, parseVerdict } from "../judge-anthropic";

const input: JudgeInput = {
  draft: { decision: "FIXTURE decision A", reason: "pattern A", visual_context: null },
  visible_case: ["FIXTURE condition C is present on the second channel"],
  knowledge: [],
};

const okJson = {
  outcome: "intervene",
  citations: [{ entry_id: "ent-guardrail-c", quote: "never save FIXTURE decision A" }],
  guiding_question: "What do you notice on the second channel?",
  explanation: "A guardrail applies.",
  uncertainty: "",
  escalation_entry_id: "",
  missing_context: "",
};

function fakeClient(response: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = [];
  const client = { beta: { messages: { create: async (params: Record<string, unknown>) => (calls.push(params), response) } } };
  return { client: client as unknown as Anthropic, calls };
}

const textResponse = (text: string, stop_reason = "end_turn") => ({ content: [{ type: "text", text }], stop_reason, stop_details: null });

describe("createAnthropicJudge", () => {
  it("sends the documented request shape and parses the verdict", async () => {
    const { client, calls } = fakeClient(textResponse(JSON.stringify(okJson)));
    const judge = createAnthropicJudge({ client });
    const v = await judge.judge(input);
    expect(judge.name).toBe(`anthropic:${DEFAULT_JUDGE_MODEL}`);
    expect(v).toMatchObject({ outcome: "intervene", uncertainty: null, escalation_entry_id: null, missing_context: null });
    const p = calls[0];
    expect(p).toMatchObject({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    expect(p).not.toHaveProperty("thinking");
    expect(JSON.parse((p.messages as { content: string }[])[0].content)).toEqual(input);
  });

  it("throws JudgeError on refusal, truncation and malformed output", async () => {
    for (const r of [textResponse("", "refusal"), textResponse("{", "max_tokens"), textResponse("not json"), textResponse(JSON.stringify({ ...okJson, outcome: "block" }))]) {
      const judge = createAnthropicJudge({ client: fakeClient(r).client });
      await expect(judge.judge(input)).rejects.toThrow(JudgeError);
    }
  });

  it("wraps transport errors", async () => {
    const client = { beta: { messages: { create: async () => Promise.reject(new Error("429")) } } } as unknown as Anthropic;
    await expect(createAnthropicJudge({ client }).judge(input)).rejects.toThrow(/Claude request failed: 429/);
  });
});

describe("parseVerdict", () => {
  it("rejects missing fields", () => {
    expect(() => parseVerdict({ ...okJson, citations: "x" })).toThrow(JudgeError);
    expect(() => parseVerdict({ ...okJson, citations: [{ entry_id: "e" }] })).toThrow(/quote/);
  });
});
