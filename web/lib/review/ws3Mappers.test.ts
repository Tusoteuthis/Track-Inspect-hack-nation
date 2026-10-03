import { describe, expect, it } from "vitest";
import { confirmationFor, confirmationSummary, isAnswered, previousRevisionNote } from "@/lib/review/ws3Mappers";
import type { ExpertConfirmation, OpenQuestion } from "@/lib/expert/contracts";
import type { ReviewView, WorkMapView } from "@/lib/ui/contracts";

const conf = (revision_id: string, status: ExpertConfirmation["status"], at_utc: string): ExpertConfirmation => ({
  confirmation_id: `${revision_id}-${status}`,
  revision_id,
  status,
  step_ids_reviewed: [],
  expert_response_exchange_id: "x",
  at_utc,
});
const map = (revision_id: string, revision_label: string) => ({ revision_id, revision_label }) as WorkMapView;
const review = (over: Partial<ReviewView>): ReviewView =>
  ({ current: map("r2", "Revision 2"), previous: map("r1", "Revision 1"), confirmations: [], open_questions: [], ...over }) as ReviewView;

describe("isAnswered", () => {
  it("is true only when an answering exchange exists", () => {
    expect(isAnswered({ answered_by_exchange_id: "x" } as OpenQuestion)).toBe(true);
    expect(isAnswered({ answered_by_exchange_id: null } as OpenQuestion)).toBe(false);
  });
});

describe("confirmationFor", () => {
  it("returns the latest confirmation of exactly that revision", () => {
    const list = [conf("r1", "corrected", "2026-10-04T10:00:00Z"), conf("r2", "unresolved", "2026-10-04T10:01:00Z"), conf("r2", "confirmed", "2026-10-04T10:02:00Z")];
    expect(confirmationFor(list, "r2")?.status).toBe("confirmed");
    expect(confirmationFor(list, "r1")?.status).toBe("corrected");
    expect(confirmationFor(list, "r3")).toBeNull();
  });
});

describe("confirmationSummary", () => {
  it("never treats another revision's confirmation as confirming the current one", () => {
    const s = confirmationSummary(review({ confirmations: [conf("r1", "confirmed", "2026-10-04T10:00:00Z")] }));
    expect(s.state).toBe("none");
    expect(s.text).toMatch(/spoken teach-back/);
  });

  it("names the confirmed revision by label", () => {
    const s = confirmationSummary(review({ confirmations: [conf("r2", "confirmed", "2026-10-04T10:00:00Z")] }));
    expect(s).toEqual({ state: "confirmed", text: "The expert confirmed Revision 2 in the spoken teach-back." });
  });

  it("describes a correction and an unresolved response", () => {
    expect(confirmationSummary(review({ confirmations: [conf("r2", "corrected", "t")] })).state).toBe("corrected");
    expect(confirmationSummary(review({ confirmations: [conf("r2", "unresolved", "t")] })).text).toMatch(/unresolved/);
  });
});

describe("previousRevisionNote", () => {
  it("describes what happened to the parent revision", () => {
    expect(previousRevisionNote(review({ confirmations: [conf("r1", "corrected", "t")] }))).toBe(
      "Revision 1 was corrected by the expert in the spoken teach-back."
    );
    expect(previousRevisionNote(review({}))).toBeNull();
    expect(previousRevisionNote(review({ previous: null }))).toBeNull();
  });
});
