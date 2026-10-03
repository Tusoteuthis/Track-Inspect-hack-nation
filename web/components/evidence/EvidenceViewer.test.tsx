// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import type { EvidenceAsset, EvidenceRegion } from "@/lib/ui/contracts";

const asset: EvidenceAsset = {
  asset_id: "asset-1",
  original_url: "/fixtures/ui/trace-a.svg",
  highlighted_url: null,
  frame_id: "frame-1",
  width_px: 1600,
  height_px: 900,
};

const region = (over: Partial<EvidenceRegion> = {}): EvidenceRegion => ({
  frame_id: "frame-1",
  coordinate_space: "original_frame_normalized",
  x: 0.25,
  y: 0.5,
  width: 0.1,
  height: 0.2,
  mapping_status: "resolved",
  ...over,
});

const root = (container: HTMLElement) => container.querySelector("[data-render-state]")!;

describe("EvidenceViewer", () => {
  it("draws a solid, labelled outline for a resolved region at the right place", () => {
    const { container } = render(<EvidenceViewer asset={asset} region={region()} />);
    expect(root(container)).toHaveAttribute("data-render-state", "resolved");
    const outline = screen.getByTestId("region-outline");
    expect(outline).toHaveAttribute("data-style", "solid");
    expect(outline).toHaveTextContent("Indicated region");
    expect(parseFloat(outline.style.left)).toBeCloseTo(25);
    expect(parseFloat(outline.style.top)).toBeCloseTo(50);
    expect(parseFloat(outline.style.width)).toBeCloseTo(10);
    expect(parseFloat(outline.style.height)).toBeCloseTo(20);
  });

  it("draws a dashed outline and says so for an ambiguous region", () => {
    render(<EvidenceViewer asset={asset} region={region({ mapping_status: "ambiguous" })} />);
    expect(screen.getByTestId("region-outline")).toHaveAttribute("data-style", "dashed");
    expect(screen.getAllByText(/Ambiguous region/).length).toBeGreaterThan(0);
  });

  it("draws nothing for an unresolved region and explains", () => {
    render(<EvidenceViewer asset={asset} region={region({ mapping_status: "unresolved" })} />);
    expect(screen.queryByTestId("region-outline")).toBeNull();
    expect(screen.getByText(/Region unresolved/)).toBeInTheDocument();
  });

  it("refuses a region recorded on a different frame", () => {
    const { container } = render(
      <EvidenceViewer asset={asset} region={region({ frame_id: "frame-2" })} />
    );
    expect(root(container)).toHaveAttribute("data-render-state", "frame_mismatch");
    expect(screen.queryByTestId("region-outline")).toBeNull();
    expect(screen.getByText("Region belongs to a different frame")).toBeInTheDocument();
  });

  it("draws nothing for invalid geometry", () => {
    render(<EvidenceViewer asset={asset} region={region({ x: 0.95, width: 0.2 })} />);
    expect(screen.queryByTestId("region-outline")).toBeNull();
    expect(screen.getByText(/Region data invalid/)).toBeInTheDocument();
  });

  it("shows the full image without outline when no region is given", () => {
    const { container } = render(<EvidenceViewer asset={asset} />);
    expect(root(container)).toHaveAttribute("data-render-state", "none");
    expect(screen.queryByTestId("region-outline")).toBeNull();
    expect(screen.queryByRole("button", { name: /focus on region/i })).toBeNull();
  });

  it("toggles between focus and full image", async () => {
    const user = userEvent.setup();
    const { container } = render(<EvidenceViewer asset={asset} region={region()} mode="focus" />);
    expect(root(container)).toHaveAttribute("data-mode", "focus");
    await user.click(screen.getByRole("button", { name: /full image/i }));
    expect(root(container)).toHaveAttribute("data-mode", "full");
    expect(screen.getByRole("button", { name: /full image/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /focus on region/i }));
    expect(root(container)).toHaveAttribute("data-mode", "focus");
  });

  it("falls back to full mode when focus is impossible", () => {
    const { container } = render(
      <EvidenceViewer asset={asset} region={region({ frame_id: "other" })} mode="focus" />
    );
    expect(root(container)).toHaveAttribute("data-mode", "full");
  });

  it("opens the inspect dialog and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(<EvidenceViewer asset={asset} region={region()} />);
    const opener = screen.getByRole("button", { name: /inspect/i });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("open");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).not.toHaveAttribute("open");
    expect(opener).toHaveFocus();
  });

  it("shows an error and no outline when the image fails to load", () => {
    render(<EvidenceViewer asset={asset} region={region()} />);
    fireEvent.error(screen.getAllByRole("img")[0]);
    expect(screen.getByText("Image could not be loaded")).toBeInTheDocument();
    expect(screen.queryByTestId("region-outline")).toBeNull();
  });
});
