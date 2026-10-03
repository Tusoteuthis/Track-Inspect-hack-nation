// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import rev1 from "@/fixtures/ui/workmap.json";
import { WorkMapList } from "@/components/workmap/WorkMapList";
import type { WorkMapView } from "@/lib/ui/contracts";

const steps = (rev1 as WorkMapView).steps;

describe("WorkMapList", () => {
  it("renders an ordered process with a kind label and status per item", () => {
    render(<WorkMapList steps={steps} selectedId={null} onSelect={() => {}} label="Work Map process" />);
    const list = screen.getByRole("list", { name: "Work Map process" });
    expect(list.tagName).toBe("OL");
    const items = screen.getAllByRole("button");
    expect(items).toHaveLength(steps.length);
    expect(items[0]).toHaveTextContent(/1\s*Step/);
    expect(items[1]).toHaveTextContent("Decision");
    expect(items[2]).toHaveTextContent("Guardrail");
    expect(items[3]).toHaveTextContent("Exception");
    expect(items[4]).toHaveTextContent("Revoked");
    expect(items[5]).toHaveTextContent("Missing");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("moves focus with arrows, Home and End, and opens with Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<WorkMapList steps={steps} selectedId={null} onSelect={onSelect} label="list" />);
    const items = screen.getAllByRole("button");
    expect(items.filter(b => b.tabIndex === 0)).toEqual([items[0]]);

    await user.tab();
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[5]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[5]).toHaveFocus();
    await user.keyboard("{Home}{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith(steps[0].entry_id);
    expect(items.filter(b => b.tabIndex === 0)).toEqual([items[0]]);
  });

  it("marks the selected item and shows change markers", () => {
    render(
      <WorkMapList steps={steps} selectedId={steps[1].entry_id} onSelect={() => {}} label="list" markers={{ [steps[1].entry_id]: "Changed" }} />
    );
    const items = screen.getAllByRole("button");
    expect(items[1]).toHaveAttribute("aria-current", "true");
    expect(items[1]).toHaveTextContent("Changed");
    expect(items[1].tabIndex).toBe(0);
    expect(items[0]).not.toHaveAttribute("aria-current");
  });
});
