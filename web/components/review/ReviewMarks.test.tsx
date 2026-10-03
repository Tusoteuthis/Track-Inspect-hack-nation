// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ReviewScreen } from "@/components/review/ReviewScreen";
import { reviewStages } from "@/components/review/reviewStages";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { createStubSource } from "@/lib/data/stubSource";

async function setup(stepTitle: string) {
  const [review] = await reviewStages();
  const stub = createStubSource({ review });
  const user = userEvent.setup();
  render(
    <DataSourceProvider source={stub.source}>
      <ReviewScreen sessionId={review.session_id} />
    </DataSourceProvider>
  );
  await screen.findByText("Revision 1");
  const item = within(screen.getByRole("list", { name: "Draft process" }))
    .getAllByRole("button")
    .find(b => b.textContent?.includes(stepTitle))!;
  await user.click(item);
  return { stub, user, review };
}

const row = (label: string) => screen.getByRole("button", { name: label }).closest("[data-mark-state]") as HTMLElement;

describe("review marks", () => {
  it("shows pending until acknowledged and never submits twice while pending", async () => {
    const { stub, user, review } = await setup("Decision point (fixture)");
    await user.click(screen.getByRole("button", { name: "Mark step for correction" }));
    expect(row("Mark step for correction")).toHaveAttribute("data-mark-state", "pending");
    expect(row("Mark step for correction")).toHaveTextContent(/Pending/);
    expect(screen.getByRole("button", { name: "Mark step for correction" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Mark step for correction" }));
    expect(stub.marks).toHaveLength(1);
    expect(stub.marks[0].mark).toEqual({
      session_id: review.session_id,
      entry_id: review.current.steps[1].entry_id,
      revision_id: review.current.revision_id,
      kind: "correction_requested",
    });

    await act(async () => stub.marks[0].result.resolve({ status: "acknowledged", value: { received_at_utc: "2026-10-04T10:00:00Z" } }));
    expect(row("Mark step for correction")).toHaveAttribute("data-mark-state", "acknowledged");
    expect(row("Mark step for correction")).toHaveTextContent("Acknowledged: request received.");
    expect(row("Mark step for correction")).not.toHaveTextContent(/corrected|saved/i);
  });

  it("shows a failure and allows a retry", async () => {
    const { stub, user } = await setup("Decision point (fixture)");
    await user.click(screen.getByRole("button", { name: "Flag unresolved" }));
    await act(async () => stub.marks[0].result.resolve({ status: "failed", error: "Backend unavailable." }));
    expect(row("Flag unresolved")).toHaveAttribute("data-mark-state", "failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Failed: Backend unavailable.");
    await user.click(screen.getByRole("button", { name: "Flag unresolved" }));
    expect(stub.marks).toHaveLength(2);
    expect(row("Flag unresolved")).toHaveAttribute("data-mark-state", "pending");
  });

  it("does not offer Flag unresolved on an unresolved item, nor marks on revoked or missing items", async () => {
    const { user } = await setup("Exception (fixture, unresolved)");
    expect(screen.getByRole("button", { name: "Mark step for correction" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Flag unresolved" })).toBeNull();
    const revoked = within(screen.getByRole("list", { name: "Draft process" }))
      .getAllByRole("button")
      .find(b => b.textContent?.includes("revoked"))!;
    await user.click(revoked);
    expect(screen.queryByRole("button", { name: "Mark step for correction" })).toBeNull();
  });
});
