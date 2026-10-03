import { describe, expect, it } from "vitest";
import { KIND_LABEL, statusPresentation } from "@/lib/ui/status";
import type { KnowledgeStatus } from "@/lib/ui/contracts";

const ALL: KnowledgeStatus[] = ["draft", "confirmed", "unresolved", "revoked", "missing"];

describe("statusPresentation", () => {
  it("only confirmed is labelled Confirmed", () => {
    expect(statusPresentation("confirmed").label).toBe("Confirmed");
    for (const s of ALL.filter(s => s !== "confirmed")) {
      expect(statusPresentation(s).label).not.toMatch(/confirmed/i);
    }
  });

  it("revoked and missing are not teaching material", () => {
    expect(statusPresentation("revoked").teachable).toBe(false);
    expect(statusPresentation("missing").teachable).toBe(false);
    for (const s of ["draft", "confirmed", "unresolved"] as const) expect(statusPresentation(s).teachable).toBe(true);
  });

  it("every status has an icon and a description, so status is not conveyed by colour", () => {
    for (const s of ALL) {
      const p = statusPresentation(s);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
    expect(new Set(ALL.map(s => statusPresentation(s).icon)).size).toBe(ALL.length);
  });

  it("labels every kind", () => {
    expect(KIND_LABEL).toEqual({ step: "Step", decision: "Decision", guardrail: "Guardrail", exception: "Exception" });
  });
});
