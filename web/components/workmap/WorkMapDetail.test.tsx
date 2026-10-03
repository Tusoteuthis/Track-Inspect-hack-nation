// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import rev1 from "@/fixtures/ui/workmap.json";
import rev2 from "@/fixtures/ui/workmap-rev-2.json";
import rev2c from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { WorkMapDetail } from "@/components/workmap/WorkMapDetail";
import { WorkMapList } from "@/components/workmap/WorkMapList";
import { focusViewport, regionToPercentRect } from "@/lib/ui/regionGeometry";
import { statusPresentation } from "@/lib/ui/status";
import type { WorkMapStep, WorkMapView } from "@/lib/ui/contracts";

const REVISIONS = [rev1, rev2, rev2c] as WorkMapView[];
const ALL_STEPS = REVISIONS.flatMap((r, i) => r.steps.map(s => ({ rev: `${r.revision_label}${i === 2 ? " confirmed" : ""}`, step: s })));
// The inspect dialog repeats the caption, so look up the figure by its figcaption.
const figureFor = (caption: string | RegExp) => screen.getByText(caption, { selector: "figcaption" }).closest("figure")!;
const teachable = (s: WorkMapStep) => statusPresentation(s.status).teachable;

describe("WorkMapDetail: evidence", () => {
  const withEvidence = ALL_STEPS.filter(({ step }) => teachable(step) && step.evidence.length > 0);

  it("covers every fixture step with evidence", () => {
    expect(withEvidence.length).toBeGreaterThanOrEqual(9);
    expect(withEvidence.some(({ step }) => step.evidence.length > 1)).toBe(true);
  });

  for (const { rev, step } of withEvidence) {
    it(`${rev} / ${step.title}: every piece opens its asset and region`, async () => {
      const user = userEvent.setup();
      render(<WorkMapDetail step={step} />);
      for (const [i, ev] of step.evidence.entries()) {
        if (step.evidence.length > 1) await user.click(screen.getByRole("button", { name: `Evidence ${i + 1}` }));
        const figure = figureFor(`Evidence ${i + 1} of ${step.evidence.length}`);
        expect(within(figure).getByRole("img", { name: "Captured trace evidence" })).toHaveAttribute("src", ev.asset.original_url);
        expect(figure).toHaveAttribute("data-mode", "focus");
        const outline = within(figure).getByTestId("region-outline");
        const rect = regionToPercentRect(ev.region!, focusViewport(ev.region!));
        expect(outline.style.left).toBe(`${rect.left}%`);
        expect(outline.style.top).toBe(`${rect.top}%`);
        expect(outline.style.width).toBe(`${rect.width}%`);
        expect(outline.style.height).toBe(`${rect.height}%`);
        expect(outline).toHaveAttribute("data-style", ev.region!.mapping_status === "ambiguous" ? "dashed" : "solid");
      }
    });
  }

  it("can switch to the full image", async () => {
    const user = userEvent.setup();
    render(<WorkMapDetail step={(rev1 as WorkMapView).steps[0]} />);
    await user.click(screen.getByRole("button", { name: "Full image" }));
    expect(figureFor(/Evidence 1/)).toHaveAttribute("data-mode", "full");
  });
});

describe("WorkMapDetail: expert words vs apprentice summary", () => {
  for (const { rev, step } of ALL_STEPS.filter(({ step }) => teachable(step) && step.expert_quotes.length)) {
    it(`${rev} / ${step.title}: quotes and summary are in separate labelled regions`, () => {
      render(<WorkMapDetail step={step} />);
      const quotes = screen.getByRole("region", { name: "Expert's words" });
      const summary = screen.getByRole("region", { name: "Apprentice summary" });
      for (const q of step.expert_quotes) {
        expect(within(quotes).getByText(q.text)).toBeInTheDocument();
        expect(summary).not.toHaveTextContent(q.text);
      }
      expect(within(summary).getByText(/AI synthesis, not the expert's words/)).toBeInTheDocument();
      if (step.ai_summary) expect(quotes).not.toHaveTextContent(step.ai_summary);
      expect(quotes.contains(summary) || summary.contains(quotes)).toBe(false);
    });
  }
});

describe("status honesty", () => {
  const nonConfirmed = ALL_STEPS.filter(({ step }) => step.status !== "confirmed");

  it("fixtures cover draft, unresolved, revoked and missing", () => {
    expect(new Set(nonConfirmed.map(({ step }) => step.status))).toEqual(new Set(["draft", "unresolved", "revoked", "missing"]));
  });

  for (const { rev, step } of nonConfirmed) {
    it(`${rev} / ${step.title} (${step.status}) never shows a Confirmed badge`, () => {
      const { container } = render(
        <>
          <WorkMapList steps={[step]} selectedId={step.entry_id} onSelect={() => {}} label="list" />
          <WorkMapDetail step={step} />
        </>
      );
      expect(container.querySelector('[data-status="confirmed"]')).toBeNull();
      expect(container).not.toHaveTextContent(/Confirmed/);
    });
  }

  it("a confirmed step does show the Confirmed badge (control)", () => {
    const step = (rev2c as WorkMapView).steps[0];
    const { container } = render(<WorkMapDetail step={step} />);
    expect(container.querySelector('.badge[data-status="confirmed"]')).toHaveTextContent("Confirmed");
  });

  for (const status of ["revoked", "missing"] as const) {
    it(`${status} items show no teaching content`, () => {
      const step = (rev1 as WorkMapView).steps.find(s => s.status === status)!;
      render(<WorkMapDetail step={step} />);
      expect(screen.getByRole("note")).toHaveTextContent(/not teaching material|nothing to teach from/);
      expect(screen.queryByRole("region")).toBeNull();
      expect(screen.queryByRole("img")).toBeNull();
      for (const q of step.expert_quotes) expect(screen.queryByText(q.text)).toBeNull();
      if (step.ai_summary) expect(screen.queryByText(step.ai_summary)).toBeNull();
    });
  }

  it("unresolved items say so and show the open question and missing states", () => {
    const step = (rev1 as WorkMapView).steps.find(s => s.status === "unresolved")!;
    render(<WorkMapDetail step={step} />);
    expect(screen.getByRole("note")).toHaveTextContent("Unresolved");
    expect(screen.getByText(step.open_question!)).toBeInTheDocument();
    expect(screen.getByText("Missing visual evidence")).toBeInTheDocument();
    expect(screen.getByText("Missing expert words")).toBeInTheDocument();
  });
});
