// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import workmapJson from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { WorkMapScreen } from "@/components/workmap/WorkMapScreen";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { createStubSource } from "@/lib/data/stubSource";
import type { TrustRequest } from "@/lib/data/stubSource";
import type { WorkMapView } from "@/lib/ui/contracts";

function only<K extends TrustRequest["kind"]>(req: TrustRequest, kind: K): Extract<TrustRequest, { kind: K }> {
  if (req.kind !== kind) throw new Error(`expected a ${kind} request`);
  return req as Extract<TrustRequest, { kind: K }>;
}

const MAP = workmapJson as WorkMapView;
const GUARDRAIL = MAP.steps.find(s => s.entry_id === "fixture-entry-003")!;

function setup() {
  const stub = createStubSource({ workmap: MAP });
  render(
    <DataSourceProvider source={stub.source}>
      <WorkMapScreen sessionId={MAP.session_id} entryId={GUARDRAIL.entry_id} revisionId={MAP.revision_id} onSelect={vi.fn()} />
    </DataSourceProvider>
  );
  return stub;
}

const revokedMap = (): WorkMapView => ({
  ...MAP,
  steps: MAP.steps.map(s => (s.entry_id === GUARDRAIL.entry_id ? { ...s, status: "revoked" } : s)),
});

describe("Trust controls on the Work Map", () => {
  it("a deletion needs two presses and stays pending until acknowledged", async () => {
    const user = userEvent.setup();
    const stub = setup();
    await user.click(await screen.findByRole("button", { name: "Delete evidence 1" }));
    expect(stub.trust).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Press again to delete evidence 1" }));
    expect(stub.trust).toEqual([expect.objectContaining({ kind: "delete", event_id: "fixture-event-003" })]);

    expect(screen.getByText(/Deleting… waiting for confirmation/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete evidence 1" })).toBeDisabled();
    expect(screen.queryByText(/Evidence deleted \(confirmed\)/)).toBeNull();

    // A second click while pending sends nothing.
    await user.click(screen.getByRole("button", { name: "Delete evidence 1" }));
    expect(stub.trust).toHaveLength(1);

    await act(async () => {
      only(stub.trust[0], "delete").result.resolve({
        status: "acknowledged",
        value: { event_id: "fixture-event-003", revoked_entry_ids: [GUARDRAIL.entry_id] },
      });
    });
    expect(screen.getByText(/Evidence deleted \(confirmed\)/)).toBeInTheDocument();
  });

  it("a failed deletion is visible and leaves the evidence in place", async () => {
    const user = userEvent.setup();
    const stub = setup();
    await user.click(await screen.findByRole("button", { name: "Delete evidence 1" }));
    await user.click(screen.getByRole("button", { name: "Press again to delete evidence 1" }));
    await act(async () => stub.trust[0].result.resolve({ status: "failed", error: "Backend refused." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Deletion not confirmed. The evidence is unchanged. Backend refused.");
    expect(screen.getByRole("button", { name: "Delete evidence 1" })).toBeEnabled();
  });

  it("removal from teaching is not shown as done before the ack; the item turns Revoked only when pushed", async () => {
    const user = userEvent.setup();
    const stub = setup();
    await user.click(await screen.findByRole("button", { name: "Remove from teaching" }));
    await user.click(screen.getByRole("button", { name: "Press again to remove from teaching" }));
    expect(stub.trust[0]).toMatchObject({ kind: "revoke", entry_id: GUARDRAIL.entry_id });
    expect(screen.getByText(/Removing… waiting for confirmation/)).toBeInTheDocument();
    // Still teaching content while pending.
    expect(screen.getByRole("heading", { name: "Expert's words" })).toBeInTheDocument();

    await act(async () => {
      only(stub.trust[0], "revoke").result.resolve({
        status: "acknowledged",
        value: { entry_id: GUARDRAIL.entry_id, revision_id: MAP.revision_id },
      });
      stub.push({ type: "workmap", workmap: revokedMap() });
    });
    expect(screen.getByText(/Removed from teaching \(confirmed\)/)).toBeInTheDocument();
    expect(screen.getByText(/This item has been revoked/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Expert's words" })).toBeNull();
  });

  it("the confirm press disarms after a timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup();
      await user.click(await screen.findByRole("button", { name: "Remove from teaching" }));
      expect(screen.getByRole("button", { name: "Press again to remove from teaching" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Remove from teaching" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
