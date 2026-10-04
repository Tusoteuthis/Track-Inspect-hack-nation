// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import assessmentJson from "@/fixtures/ui/assessment.json";
import { SummaryScreen } from "@/components/summary/SummaryScreen";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { createStubSource } from "@/lib/data/stubSource";
import type { AssessmentView } from "@/lib/ui/contracts";

const FIXTURE = assessmentJson as AssessmentView;

function setup(init: Parameters<typeof createStubSource>[0], sessionId: string | null = FIXTURE.session_id) {
  const stub = createStubSource(init);
  render(
    <DataSourceProvider source={stub.source}>
      <SummaryScreen sessionId={sessionId} />
    </DataSourceProvider>
  );
  return stub;
}

const group = (key: string) => document.querySelector<HTMLElement>(`[data-group="${key}"]`)!;

describe("SummaryScreen", () => {
  it("renders the four groups with labelled headings and the fixture banner", async () => {
    setup({ assessment: FIXTURE });
    expect(await screen.findByRole("heading", { name: /Done independently/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Needed help/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Unresolved/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /What to practise next/ })).toBeInTheDocument();
    expect(screen.getByText("FIXTURE DATA")).toBeInTheDocument();
  });

  it("never places an assisted item under done independently", async () => {
    const mislabelled: AssessmentView = {
      ...FIXTURE,
      independent: [
        { description: "Helped but labelled independent", citations: [], interventions: ["A hint was given."] },
        { description: "Really alone", citations: [], interventions: [] },
      ],
      assisted: [],
    };
    setup({ assessment: mislabelled });
    await screen.findByRole("heading", { name: /Done independently/ });
    expect(within(group("independent")).queryByText(/Helped but labelled independent/)).toBeNull();
    expect(within(group("independent")).getByText(/Really alone/)).toBeInTheDocument();
    expect(within(group("assisted")).getByText(/Helped but labelled independent/)).toBeInTheDocument();
    expect(within(group("assisted")).getByText("A hint was given.")).toBeInTheDocument();
  });

  it("shows the intervention and deep-links each cited entry to the Work Map", async () => {
    setup({ assessment: FIXTURE });
    await screen.findByRole("heading", { name: /Needed help/ });
    const assisted = within(group("assisted"));
    expect(assisted.getByText(FIXTURE.assisted[0].interventions![0])).toBeInTheDocument();
    const link = assisted.getByRole("link", { name: /Open the cited expert entry/ });
    expect(link).toHaveAttribute("href", "/map?entry=fixture-entry-003&rev=fixture-rev-2");
  });

  it("shows no overall score and no internal ids as text", async () => {
    setup({ assessment: FIXTURE });
    await screen.findByRole("heading", { name: /Needed help/ });
    expect(document.body.textContent).not.toMatch(/score|%|\d+\s*\/\s*\d+/i);
    expect(document.body.textContent).not.toMatch(/fixture-entry|fixture-rev|fixture-newcomer/);
  });

  it("shows WS5 limitations", async () => {
    setup({ assessment: FIXTURE });
    expect(await screen.findByRole("heading", { name: "What this summary cannot show" })).toBeInTheDocument();
  });

  it("has an empty state for an empty assessment and for no session", async () => {
    setup({
      assessment: { ...FIXTURE, independent: [], assisted: [], unresolved: [], practice_next: [] },
    });
    expect(await screen.findByText(/No assessment yet/)).toBeInTheDocument();
  });

  it("has an empty state when no session is selected", () => {
    setup({ assessment: FIXTURE }, null);
    expect(screen.getByText(/No practice session selected/)).toBeInTheDocument();
  });

  it("renders its error state when the source rejects", async () => {
    setup({ rejectAll: "backend down" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the learning summary: backend down");
  });

  it("shows the shared reconnecting banner", async () => {
    const stub = setup({ assessment: FIXTURE });
    await screen.findByRole("heading", { name: /Needed help/ });
    act(() => stub.push({ type: "connection", state: "reconnecting" }));
    expect(screen.getByTestId("reconnecting")).toHaveTextContent("Reconnecting…");
  });
});
