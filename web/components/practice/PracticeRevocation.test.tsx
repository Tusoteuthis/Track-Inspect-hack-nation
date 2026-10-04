// @vitest-environment jsdom
// Integration with the real fixture source: a revoke issued from another
// screen (here: directly on the shared knowledge store's source) reaches
// /practice, removing the cited expert example.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import practiceCase from "@/fixtures/ui/practice-case.json";
import { PracticeScreen } from "@/components/practice/PracticeScreen";
import { createFixtureKnowledge } from "@/lib/data/fixtureKnowledge";
import { createFixtureSource, FIXTURE_IDS } from "@/lib/data/fixtureSource";
import type { PracticeCaseView } from "@/lib/ui/contracts";

describe("/practice citations after a revocation (fixture source)", () => {
  it("a revoked item disappears from the cited expert examples", async () => {
    const knowledge = createFixtureKnowledge();
    const practiceSource = createFixtureSource({ latencyMs: 0, knowledge });
    const mapSource = createFixtureSource({ latencyMs: 0, knowledge });
    const user = userEvent.setup();
    render(
      <PracticeScreen
        source={practiceSource}
        caseView={practiceCase as PracticeCaseView}
        sessionId={FIXTURE_IDS.newcomerSession}
      />
    );
    await user.type(screen.getByLabelText("Decision"), "A wrong decision");
    await user.type(screen.getByLabelText("Reason"), "A reason");
    await user.click(screen.getByRole("button", { name: "Request review" }));
    const example = await screen.findByRole("button", { name: "Open expert example 1" });
    expect(example).toBeInTheDocument();

    // The cited entry is the fixture guardrail; another screen removes it from teaching.
    await act(async () => {
      const ack = await mapSource.revokeEntry("fixture-entry-003", "fixture-rev-2");
      expect(ack.status).toBe("acknowledged");
    });

    expect(screen.queryByRole("button", { name: /Open expert example/ })).toBeNull();
    expect(screen.getByTestId("revoked-notice")).toBeInTheDocument();

    // A fresh review never cites it again.
    await user.type(screen.getByLabelText("Reason"), " revised");
    await user.click(screen.getByRole("button", { name: "Request review" }));
    await screen.findByText(/review complete|Ready to save/i);
    expect(screen.queryByText(/Expert guardrail wording/)).toBeNull();
  });
});
