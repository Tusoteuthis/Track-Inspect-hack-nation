import { describe, expect, it } from "vitest";
import { mapHref, resolveDeepLink } from "@/lib/workmap/deepLink";
import type { WorkMapView } from "@/lib/ui/contracts";

const view = {
  revision_id: "rev-2",
  steps: [{ entry_id: "e1" }, { entry_id: "e2" }],
} as unknown as WorkMapView;

describe("resolveDeepLink", () => {
  it("selects nothing without a link", () => {
    expect(resolveDeepLink(view, null, null)).toEqual({ selectedId: null, notice: null });
  });

  it("selects the linked entry of the current revision", () => {
    expect(resolveDeepLink(view, "e2", "rev-2")).toEqual({ selectedId: "e2", notice: null });
    expect(resolveDeepLink(view, "e2", null)).toEqual({ selectedId: "e2", notice: null });
  });

  it("keeps the entry but flags a link to another revision", () => {
    expect(resolveDeepLink(view, "e1", "rev-1")).toEqual({ selectedId: "e1", notice: "other_revision" });
    expect(resolveDeepLink(view, null, "rev-1")).toEqual({ selectedId: null, notice: "other_revision" });
  });

  it("flags an unknown entry and selects nothing", () => {
    expect(resolveDeepLink(view, "nope", "rev-2")).toEqual({ selectedId: null, notice: "unknown_entry" });
  });
});

describe("mapHref", () => {
  it("encodes entry and revision", () => {
    expect(mapHref("e 1", "rev/2")).toBe("/map?entry=e+1&rev=rev%2F2");
  });
});
