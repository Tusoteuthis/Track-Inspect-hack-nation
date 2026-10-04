import { describe, expect, it } from "vitest";
import { summaryGroups } from "@/lib/summary/groups";
import type { AssessmentItem, AssessmentView } from "@/lib/ui/contracts";

const item = (description: string, interventions?: string[]): AssessmentItem => ({
  description,
  citations: [],
  ...(interventions ? { interventions } : {}),
});

const view = (over: Partial<AssessmentView>): AssessmentView => ({
  session_id: "s",
  independent: [],
  assisted: [],
  unresolved: [],
  practice_next: [],
  evidence_used: [],
  source: "fixture",
  ...over,
});

describe("summaryGroups", () => {
  it("keeps the groups WS5 supplied", () => {
    const g = summaryGroups(view({ independent: [item("a")], assisted: [item("b", ["hint"])], unresolved: [item("c")] }));
    expect(g.independent.map(i => i.description)).toEqual(["a"]);
    expect(g.assisted.map(i => i.description)).toEqual(["b"]);
    expect(g.unresolved.map(i => i.description)).toEqual(["c"]);
  });

  it("never shows an item with interventions under done independently", () => {
    const g = summaryGroups(view({ independent: [item("helped", ["hint"]), item("alone", [])] }));
    expect(g.independent.map(i => i.description)).toEqual(["alone"]);
    expect(g.assisted.map(i => i.description)).toEqual(["helped"]);
  });

  it("puts reclassified items after the ones WS5 already marked assisted", () => {
    const g = summaryGroups(view({ independent: [item("helped", ["hint"])], assisted: [item("first", ["x"])] }));
    expect(g.assisted.map(i => i.description)).toEqual(["first", "helped"]);
  });

  it("reports whether the assessment is empty", () => {
    expect(summaryGroups(view({})).empty).toBe(true);
    expect(summaryGroups(view({ practice_next: ["p"] })).empty).toBe(false);
  });
});
