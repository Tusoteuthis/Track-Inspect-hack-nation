import { describe, expect, it } from "vitest";
import * as knowledge from "./index";

describe("public API", () => {
  it("exports the sprint-1 functions", () => {
    for (const name of [
      "renderEntryMarkdown",
      "parseEntryMarkdown",
      "validateEntry",
      "assertQuotesVerbatim",
      "nextStatus",
      "isTeachable",
      "selectEligible",
      "retrieve",
    ] as const) {
      expect(typeof knowledge[name]).toBe("function");
    }
    expect(knowledge.WS5_SCHEMA_VERSION).toBe("ws5.v0");
  });

  it("exports the sprint-2 functions", () => {
    for (const name of [
      "synthesize",
      "renderWorkflowMarkdown",
      "findGaps",
      "buildTeachBack",
      "buildWorkMap",
      "createWs6SynthesisModule",
    ] as const) {
      expect(typeof knowledge[name]).toBe("function");
    }
    expect(typeof knowledge.ws3Synthesis.buildDraft).toBe("function");
    expect(knowledge.SYNTHESIS_MODULE.module).toBe("ws5-synthesis");
  });
});
