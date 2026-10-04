// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { ReviewScreen } from "@/components/review/ReviewScreen";
import { reviewStages } from "@/components/review/reviewStages";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { fixtureReviewControls, fixtureSource } from "@/lib/data/fixtureSource";
import { createStubSource } from "@/lib/data/stubSource";
import type { ReviewView } from "@/lib/ui/contracts";

let STAGES: ReviewView[];
beforeAll(async () => {
  STAGES = await reviewStages();
});

function setup(initial: ReviewView) {
  const stub = createStubSource({ review: initial });
  const utils = render(
    <DataSourceProvider source={stub.source}>
      <ReviewScreen sessionId={initial.session_id} />
    </DataSourceProvider>
  );
  return { ...utils, stub };
}
const header = () => screen.getByRole("region", { name: "Revision under review" });
const list = () => screen.getByRole("list", { name: "Draft process" });

describe("ReviewScreen", () => {
  it("shows the revision under review, its change state, and open questions", async () => {
    setup(STAGES[0]);
    await screen.findByText("Revision 1");
    expect(header()).toHaveTextContent("Revision under review: Revision 1");
    expect(header()).toHaveTextContent("First revision: there is no previous revision to compare with.");
    expect(header()).toHaveTextContent("Revision 1 is not confirmed yet. Confirmation happens in the spoken teach-back.");
    expect(within(list()).getAllByRole("button")).toHaveLength(STAGES[0].current.steps.length);
    const questions = screen.getByRole("region", { name: "Open questions and gaps" });
    expect(within(questions).getAllByText("Answered")).toHaveLength(1);
    expect(within(questions).getAllByText("Unanswered")).toHaveLength(2);
  });

  it("offers no approve or confirm control and explains the spoken teach-back", async () => {
    setup(STAGES[0]);
    await screen.findByText("Revision 1");
    expect(screen.queryByRole("button", { name: /approve|confirm/i })).toBeNull();
    expect(screen.getByText(/Confirmation happens in the spoken teach-back with the expert/)).toBeInTheDocument();
  });

  it("updates when subscribe delivers a new revision and marks what changed, old → new", async () => {
    const user = userEvent.setup();
    const { stub } = setup(STAGES[0]);
    await screen.findByText("Revision 1");

    act(() => stub.push({ type: "review", review: STAGES[1] }));
    expect(header()).toHaveTextContent("The expert corrected Revision 1 in the spoken teach-back.");
    expect(screen.getByText("Teach-back result received for Revision 1.")).toBeInTheDocument();

    act(() => stub.push({ type: "review", review: STAGES[2] }));
    expect(header()).toHaveTextContent("Revision under review: Revision 2");
    expect(header()).toHaveTextContent("Changed since Revision 1: 1 item changed.");
    expect(header()).toHaveTextContent("Revision 2 is not confirmed yet.");
    expect(header()).toHaveTextContent("Revision 1 was corrected by the expert in the spoken teach-back.");
    expect(screen.getByText("New revision received: Revision 2. Changed items are marked.")).toBeInTheDocument();

    const items = within(list()).getAllByRole("button");
    const changed = items.filter(b => b.querySelector("[data-marker]"));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toHaveTextContent("Decision point (fixture)");
    expect(changed[0]).toHaveTextContent("Changed");

    await user.click(changed[0]);
    const changes = screen.getByRole("region", { name: "What changed since Revision 1" });
    const reasoning = changes.querySelector('[data-change-field="reasoning"]')!;
    expect(within(reasoning as HTMLElement).getByLabelText("Before: (none)")).toBeInTheDocument();
    expect(within(reasoning as HTMLElement).getByLabelText(`After: ${STAGES[2].current.steps[1].reasoning}`)).toBeInTheDocument();
    expect(changes.querySelector('[data-change-field="expert_quotes"]')).not.toBeNull();
  });

  it("shows a confirmation only for the exact revision it names", async () => {
    const { stub } = setup(STAGES[2]);
    await screen.findByText("Revision 2");
    expect(header().querySelector("[data-confirmation]")).toHaveAttribute("data-confirmation", "none");
    act(() => stub.push({ type: "review", review: STAGES[3] }));
    expect(header().querySelector("[data-confirmation]")).toHaveAttribute("data-confirmation", "confirmed");
    expect(header()).toHaveTextContent("The expert confirmed Revision 2 in the spoken teach-back.");
    expect(screen.getByText("Teach-back result received for Revision 2.")).toBeInTheDocument();
  });

  it("never shows internal record ids as text, before or after updates", async () => {
    const { stub, container } = setup(STAGES[0]);
    await screen.findByText("Revision 1");
    for (const stage of STAGES) {
      act(() => stub.push({ type: "review", review: stage }));
      expect(container).not.toHaveTextContent(/fixture-[a-z-]+\d/);
    }
  });

  it("shows fixture playback only for the fixture source and steps the script", async () => {
    const user = userEvent.setup();
    const { unmount } = setup(STAGES[0]);
    await screen.findByText("Revision 1");
    expect(screen.queryByRole("region", { name: /Fixture playback/ })).toBeNull();
    unmount();

    fixtureReviewControls.reset();
    render(
      <DataSourceProvider source={fixtureSource}>
        <ReviewScreen sessionId={STAGES[0].session_id} />
      </DataSourceProvider>
    );
    await screen.findByText("Revision 1");
    const playback = screen.getByRole("region", { name: /Fixture playback/ });
    await user.click(within(playback).getByRole("button", { name: /^Next:/ }));
    await user.click(within(playback).getByRole("button", { name: /^Next:/ }));
    expect(header()).toHaveTextContent("Revision under review: Revision 2");
    await user.click(within(playback).getByRole("button", { name: /^Next:/ }));
    expect(header()).toHaveTextContent("The expert confirmed Revision 2");
    expect(within(playback).getByRole("button", { name: "End of script" })).toBeDisabled();
    await user.click(within(playback).getByRole("button", { name: "Restart" }));
    expect(header()).toHaveTextContent("Revision under review: Revision 1");
  });
});
