import { beforeEach, describe, expect, it, vi } from "vitest";
import workmap from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { createFixtureKnowledge, type FixtureKnowledge } from "@/lib/data/fixtureKnowledge";
import type { ReviewView, WorkMapView } from "@/lib/ui/contracts";

const MAP = workmap as WorkMapView;
const step = (view: WorkMapView, id: string) => view.steps.find(s => s.entry_id === id)!;

describe("fixtureKnowledge", () => {
  let store: FixtureKnowledge;
  beforeEach(() => {
    store = createFixtureKnowledge();
  });

  it("leaves views unchanged while nothing is revoked or deleted", () => {
    expect(store.apply(MAP)).toEqual(MAP);
  });

  it("marks a revoked entry as revoked and keeps it in the view (history)", () => {
    store.revoke("fixture-entry-003", "fixture-rev-2");
    const view = store.apply(MAP);
    expect(step(view, "fixture-entry-003").status).toBe("revoked");
    expect(view.steps).toHaveLength(MAP.steps.length);
    expect(step(view, "fixture-entry-001").status).toBe("confirmed");
  });

  it("does not mutate the input view", () => {
    store.revoke("fixture-entry-003", "fixture-rev-2");
    store.apply(MAP);
    expect(step(MAP, "fixture-entry-003").status).toBe("confirmed");
  });

  it("deleting evidence removes it and revokes every entry that cited it (cascade)", () => {
    const revoked = store.deleteEvent("fixture-event-001", MAP);
    expect(revoked).toEqual(["fixture-entry-001"]);
    const view = store.apply(MAP);
    const s1 = step(view, "fixture-entry-001");
    expect(s1.status).toBe("revoked");
    expect(s1.evidence.map(e => e.event_id)).toEqual(["fixture-event-006"]);
  });

  it("deleting evidence nobody cites revokes nothing", () => {
    expect(store.deleteEvent("fixture-event-999", MAP)).toEqual([]);
  });

  it("applies to both revisions of a review view", () => {
    store.revoke("fixture-entry-002", "fixture-rev-2");
    const review = { current: MAP, previous: MAP } as ReviewView;
    const out = store.applyReview(review);
    expect(step(out.current, "fixture-entry-002").status).toBe("revoked");
    expect(step(out.previous!, "fixture-entry-002").status).toBe("revoked");
  });

  it("notifies listeners per revoked entry and stops after unsubscribe", () => {
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.revoke("fixture-entry-003", "fixture-rev-2");
    expect(listener).toHaveBeenCalledWith({
      type: "knowledge",
      entry_id: "fixture-entry-003",
      revision_id: "fixture-rev-2",
      status: "revoked",
    });
    off();
    store.revoke("fixture-entry-002", "fixture-rev-2");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reset forgets revocations and deletions", () => {
    store.revoke("fixture-entry-003", "fixture-rev-2");
    store.deleteEvent("fixture-event-001", MAP);
    store.reset();
    expect(store.apply(MAP)).toEqual(MAP);
    expect(store.isRevoked("fixture-entry-003")).toBe(false);
  });
});
