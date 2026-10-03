import { describe, expect, it } from "vitest";
import rev1 from "@/fixtures/ui/workmap.json";
import rev2 from "@/fixtures/ui/workmap-rev-2.json";
import rev2c from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { diffRevisions } from "@/lib/review/revisionDiff";
import type { WorkMapView } from "@/lib/ui/contracts";

const R1 = rev1 as WorkMapView;
const R2 = rev2 as WorkMapView;
const R2C = rev2c as WorkMapView;

describe("diffRevisions", () => {
  it("reports no previous revision", () => {
    const d = diffRevisions(null, R1);
    expect(d).toMatchObject({ hasPrevious: false, anyChange: false, added: [], removed: [] });
    expect(d.changed).toEqual({});
  });

  it("ignores the revision id that every step carries", () => {
    const same = structuredClone(R1);
    same.revision_id = "other";
    same.steps.forEach(s => (s.revision_id = "other"));
    expect(diffRevisions(R1, same).anyChange).toBe(false);
  });

  it("reports the corrected fields old → new for the corrected entry only", () => {
    const d = diffRevisions(R1, R2);
    expect(d.anyChange).toBe(true);
    expect(Object.keys(d.changed)).toEqual(["fixture-entry-002"]);
    const fields = d.changed["fixture-entry-002"].map(c => c.field);
    expect(fields).toEqual(["ai_summary", "reasoning", "expert_quotes"]);
    const reasoning = d.changed["fixture-entry-002"].find(c => c.field === "reasoning")!;
    expect(reasoning.before).toBe("(none)");
    expect(reasoning.after).toBe(R2.steps[1].reasoning);
    expect(reasoning.label).toBe("Reasoning");
  });

  it("reports status changes with display labels", () => {
    const d = diffRevisions(R1, R2C);
    const status = d.changed["fixture-entry-001"].find(c => c.field === "status")!;
    expect(status).toMatchObject({ before: "Draft", after: "Confirmed" });
    expect(d.changed["fixture-entry-004"]).toBeUndefined();
  });

  it("reports added and removed entries by title", () => {
    const next = structuredClone(R1);
    const removed = next.steps.shift()!;
    next.steps.push({ ...structuredClone(removed), entry_id: "new-entry", title: "New" });
    const d = diffRevisions(R1, next);
    expect(d.added).toEqual(["new-entry"]);
    expect(d.removed).toEqual([{ entry_id: removed.entry_id, title: removed.title }]);
    expect(d.anyChange).toBe(true);
  });

  it("notices evidence changes without exposing ids", () => {
    const next = structuredClone(R1);
    next.steps[0].evidence[0].region!.x = 0.3;
    const change = diffRevisions(R1, next).changed["fixture-entry-001"][0];
    expect(change.field).toBe("evidence");
    expect(`${change.before} ${change.after}`).not.toMatch(/fixture-/);
    expect(change.before).not.toBe(change.after);
  });
});
