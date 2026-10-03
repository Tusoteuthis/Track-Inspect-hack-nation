// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import rev1 from "@/fixtures/ui/workmap.json";
import rev2 from "@/fixtures/ui/workmap-rev-2.json";
import { WorkMapScreen } from "@/components/workmap/WorkMapScreen";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { createStubSource } from "@/lib/data/stubSource";
import type { WorkMapView } from "@/lib/ui/contracts";

const R1 = rev1 as WorkMapView;
const R2 = rev2 as WorkMapView;

function setup(entryId: string | null, revisionId: string | null) {
  const stub = createStubSource({ workmap: R1 });
  const onSelect = vi.fn();
  const utils = render(
    <DataSourceProvider source={stub.source}>
      <WorkMapScreen sessionId={R1.session_id} entryId={entryId} revisionId={revisionId} onSelect={onSelect} />
    </DataSourceProvider>
  );
  return { ...utils, stub, onSelect };
}

describe("WorkMapScreen", () => {
  it("shows the revision label, the fixture banner and no selection by default", async () => {
    setup(null, null);
    expect(await screen.findByText("Showing Revision 1")).toBeInTheDocument();
    expect(screen.getByText("FIXTURE DATA")).toBeInTheDocument();
    expect(screen.getByText(/Select an item/)).toBeInTheDocument();
  });

  it("selects the deep-linked entry and reports clicks with the revision", async () => {
    const user = userEvent.setup();
    const { onSelect, container } = setup(R1.steps[2].entry_id, R1.revision_id);
    expect(await screen.findByRole("heading", { level: 2, name: R1.steps[2].title })).toBeInTheDocument();
    expect(container.querySelector("[data-link-notice]")).toBeNull();
    await user.click(within(screen.getByRole("list", { name: "Work Map process" })).getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalledWith(R1.steps[0].entry_id, R1.revision_id);
  });

  it("flags links to another revision and unknown entries", async () => {
    const { unmount } = setup(R1.steps[0].entry_id, "some-other-rev");
    expect(await screen.findByText(/link referred to another revision/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: R1.steps[0].title })).toBeInTheDocument();
    unmount();
    setup("no-such-entry", R1.revision_id);
    expect(await screen.findByText("The linked item is not part of Revision 1.")).toBeInTheDocument();
  });

  it("follows a pushed revision and says when the selected item is gone", async () => {
    const { stub } = setup(R1.steps[1].entry_id, R1.revision_id);
    await screen.findByText("Showing Revision 1");
    const next = structuredClone(R2);
    next.steps = next.steps.filter(s => s.entry_id !== R1.steps[1].entry_id);
    act(() => stub.push({ type: "workmap", workmap: next }));
    expect(screen.getByText("Showing Revision 2")).toBeInTheDocument();
    expect(screen.getByText("The linked item is not part of Revision 2.")).toBeInTheDocument();
  });

  it("never shows internal record ids as text", async () => {
    const { container } = setup(R1.steps[0].entry_id, R1.revision_id);
    await screen.findByText("Showing Revision 1");
    expect(container).not.toHaveTextContent(/fixture-[a-z-]+\d/);
  });
});
