import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO, formatScenarioOffsets, parseScenarioOffsets } from "./scenario";

describe("fixture scenario", () => {
  it("injects evt-001, its duplicate evt-003, evt-002 and the ambiguous evt-004 in that order", () => {
    expect(DEFAULT_SCENARIO.map(s => s.event_id)).toEqual(["evt-001", "evt-003", "evt-002", "evt-004"]);
    // the duplicate lands inside the 20 s dedup window
    expect(DEFAULT_SCENARIO[1].offset_s - DEFAULT_SCENARIO[0].offset_s).toBeLessThan(20);
  });

  it("parses comma-separated offsets in seconds", () => {
    expect(parseScenarioOffsets("0, 5, 60,120")).toEqual({
      ok: true,
      value: [
        { event_id: "evt-001", offset_s: 0 },
        { event_id: "evt-003", offset_s: 5 },
        { event_id: "evt-002", offset_s: 60 },
        { event_id: "evt-004", offset_s: 120 },
      ],
    });
    expect(formatScenarioOffsets(DEFAULT_SCENARIO)).toBe(DEFAULT_SCENARIO.map(s => s.offset_s).join(", "));
  });

  it("rejects the wrong count, negatives and non-numbers", () => {
    for (const bad of ["0, 5, 60", "0, 5, 60, 120, 3", "0, -5, 60, 120", "0, x, 60, 120", ""]) {
      expect(parseScenarioOffsets(bad).ok).toBe(false);
    }
  });
});
