// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PracticeScreen } from "@/components/practice/PracticeScreen";
import { acknowledged, failed, type Ack, type DataSource, type SourceUpdate } from "@/lib/data/source";
import type { LearnerDraft, LearnerEvaluation, PracticeCaseView, WorkMapView } from "@/lib/ui/contracts";

const CASE: PracticeCaseView = {
  case_id: "case-1",
  asset: {
    asset_id: "a",
    original_url: "/trace.svg",
    highlighted_url: null,
    frame_id: "frame-b",
    width_px: 1600,
    height_px: 900,
  },
  visible_context: ["Visible context line."],
  decision_options: null,
  knowledge_revision_id: "k-1",
  source: "fixture",
};

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

function evaluationFor(draft: LearnerDraft, outcome: string, over: Partial<LearnerEvaluation> = {}): LearnerEvaluation {
  return {
    evaluation_id: `ev-${draft.draft_revision}`,
    draft_revision: draft.draft_revision,
    knowledge_revision_id: "k-1",
    outcome,
    message: outcome === "ok" ? "Looks reviewed." : "Please reconsider.",
    guiding_question: outcome === "ok" ? null : "What did the expert check?",
    citations: [],
    ...over,
  };
}

/** Fake source: reviews and commits resolve only when the test says so. */
function fakeSource() {
  const reviews: { draft: LearnerDraft; d: Deferred<Ack<LearnerEvaluation>> }[] = [];
  const commits: { draft: LearnerDraft; key?: string; d: Deferred<Ack<{ committed_at_utc: string }>> }[] = [];
  const listeners = new Set<(u: SourceUpdate) => void>();
  const source: DataSource = {
    kind: "api",
    getSession: vi.fn(),
    getWorkMap: vi.fn(),
    getPracticeCase: vi.fn(),
    getAssessment: vi.fn(),
    requestOffRecord: vi.fn(),
    listCases: vi.fn(),
    startSession: vi.fn(),
    requestPause: vi.fn(),
    requestStop: vi.fn(),
    getRecentEvents: vi.fn(),
    submitDraftForReview: vi.fn((draft: LearnerDraft) => {
      const d = deferred<Ack<LearnerEvaluation>>();
      reviews.push({ draft, d });
      return d.promise;
    }),
    commitDraft: vi.fn((draft: LearnerDraft, _ev: LearnerEvaluation, opts?: { idempotency_key: string }) => {
      const d = deferred<Ack<{ committed_at_utc: string }>>();
      commits.push({ draft, key: opts?.idempotency_key, d });
      return d.promise;
    }),
    submitScreenFrame: vi.fn(),
    getReview: vi.fn(),
    submitReviewMark: vi.fn(),
    revokeEntry: vi.fn(),
    deleteEvidence: vi.fn(),
    subscribe: vi.fn((_id: string, fn: (u: SourceUpdate) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }),
  };
  return {
    source,
    reviews,
    commits,
    emit: (u: SourceUpdate) => act(() => listeners.forEach(l => l(u))),
  };
}

function setup() {
  const fake = fakeSource();
  const user = userEvent.setup();
  render(<PracticeScreen source={fake.source} caseView={CASE} sessionId="s-1" />);
  const status = () => screen.getByTestId("review-status");
  const saveButton = () => screen.getByRole("button", { name: /save decision|retry save/i });
  const fill = async (decision = "My decision", reason = "My reason") => {
    await user.type(screen.getByLabelText("Decision"), decision);
    await user.type(screen.getByLabelText("Reason"), reason);
  };
  const resolveReview = async (i: number, outcome: string, over: Partial<LearnerEvaluation> = {}) => {
    const r = fake.reviews[i];
    await act(async () => r.d.resolve(acknowledged(evaluationFor(r.draft, outcome, over))));
  };
  /** Draft → review → guidance → edit → review → complete. */
  const reachReviewComplete = async () => {
    await fill();
    await user.click(screen.getByRole("button", { name: "Request review" }));
    await resolveReview(0, "intervene");
    await user.type(screen.getByLabelText("Reason"), " revised");
    await user.click(screen.getByRole("button", { name: "Request review" }));
    await resolveReview(1, "ok");
  };
  return { fake, user, status, saveButton, fill, resolveReview, reachReviewComplete };
}

describe("PracticeScreen pre-save review loop", () => {
  it("catches a draft with guidance and only enables Save after a review of the corrected draft", async () => {
    const t = setup();
    await t.fill();
    expect(t.saveButton()).toBeDisabled();
    expect(t.status()).toHaveTextContent("Draft changed / not yet reviewed");
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    expect(t.status()).toHaveTextContent("Review pending");
    await t.resolveReview(0, "intervene");
    expect(t.status()).toHaveTextContent(/guidance needed/i);
    expect(screen.getByText("What did the expert check?")).toBeInTheDocument();
    expect(t.saveButton()).toBeDisabled();
    expect(screen.getByTestId("save-blocked-reason")).toHaveTextContent(/change your draft/i);
    await t.user.type(screen.getByLabelText("Reason"), " revised");
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    await t.resolveReview(1, "ok");
    expect(t.status()).toHaveTextContent(/review complete/i);
    expect(t.saveButton()).toBeEnabled();
  });

  it("editing after review disables Save and shows 'Draft changed / not yet reviewed'", async () => {
    const t = setup();
    await t.reachReviewComplete();
    expect(t.saveButton()).toBeEnabled();
    await t.user.type(screen.getByLabelText("Decision"), "!");
    expect(t.status()).toHaveTextContent("Draft changed / not yet reviewed");
    expect(t.saveButton()).toBeDisabled();
    expect(t.saveButton()).toHaveAttribute("aria-describedby", "save-blocked-reason");
  });

  it("ignores a stale evaluation that arrives after the draft changed", async () => {
    const t = setup();
    await t.fill();
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    // The review of the old revision is still in flight when the learner edits.
    await t.user.type(screen.getByLabelText("Reason"), " more");
    await t.resolveReview(0, "ok");
    expect(t.status()).toHaveTextContent("Draft changed / not yet reviewed");
    expect(t.saveButton()).toBeDisabled();
  });

  it("ignores an evaluation made against another knowledge revision", async () => {
    const t = setup();
    await t.fill();
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    await t.resolveReview(0, "ok", { knowledge_revision_id: "k-0" });
    expect(t.status()).toHaveTextContent("Review pending");
    expect(t.saveButton()).toBeDisabled();
  });

  it("a knowledge-revision change invalidates a completed review", async () => {
    const t = setup();
    await t.reachReviewComplete();
    expect(t.saveButton()).toBeEnabled();
    t.fake.emit({ type: "workmap", workmap: { session_id: "s-1", revision_id: "k-2", steps: [], source: "fixture" } as unknown as WorkMapView });
    expect(t.status()).toHaveTextContent("Draft changed / not yet reviewed");
    expect(t.saveButton()).toBeDisabled();
  });

  it("a double click on Save sends exactly one commit", async () => {
    const t = setup();
    await t.reachReviewComplete();
    await t.user.dblClick(t.saveButton());
    expect(t.fake.source.commitDraft).toHaveBeenCalledTimes(1);
    expect(t.fake.commits[0].key).toBeTruthy();
  });

  it("never shows Saved before the commit is acknowledged", async () => {
    const t = setup();
    await t.reachReviewComplete();
    await t.user.click(t.saveButton());
    expect(t.status()).toHaveTextContent(/saving/i);
    expect(screen.queryByText(/^Saved$/)).toBeNull();
    expect(within(screen.getByRole("region", { name: "Timeline" })).queryByText("Saved")).toBeNull();
    expect(screen.getByLabelText("Decision")).toBeDisabled();
    await act(async () => t.fake.commits[0].d.resolve(acknowledged({ committed_at_utc: "2026-10-04T10:00:00Z" })));
    expect(t.status()).toHaveTextContent(/^\W*Saved$/);
    expect(within(screen.getByRole("region", { name: "Timeline" })).getByText("Saved")).toBeInTheDocument();
  });

  it("shows a save failure with a retry, and retries with a new commit", async () => {
    const t = setup();
    await t.reachReviewComplete();
    await t.user.click(t.saveButton());
    await act(async () => t.fake.commits[0].d.resolve(failed("evaluation_stale")));
    expect(screen.getByRole("alert")).toHaveTextContent(/not saved: evaluation_stale/i);
    expect(t.status()).not.toHaveTextContent(/^\W*Saved$/);
    const retry = screen.getByRole("button", { name: "Retry save" });
    expect(retry).toBeEnabled();
    await t.user.click(retry);
    expect(t.fake.source.commitDraft).toHaveBeenCalledTimes(2);
    expect(t.fake.commits[1].key).not.toBe(t.fake.commits[0].key);
    await act(async () => t.fake.commits[1].d.resolve(acknowledged({ committed_at_utc: "t" })));
    expect(t.status()).toHaveTextContent(/^\W*Saved$/);
  });

  it("a failed review returns to unreviewed with a visible error and can be requested again", async () => {
    const t = setup();
    await t.fill();
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    await act(async () => t.fake.reviews[0].d.resolve(failed("tutor unavailable")));
    expect(screen.getByRole("alert")).toHaveTextContent(/tutor unavailable/);
    expect(screen.getByRole("button", { name: "Request review" })).toBeEnabled();
  });

  it("records the timeline proposed → guidance → corrected → saved", async () => {
    const t = setup();
    await t.reachReviewComplete();
    await t.user.click(t.saveButton());
    await act(async () => t.fake.commits[0].d.resolve(acknowledged({ committed_at_utc: "t" })));
    const items = within(screen.getByTestId("timeline")).getAllByRole("listitem");
    expect(items.map(li => li.getAttribute("data-kind"))).toEqual(["proposed", "guidance", "corrected", "saved"]);
  });

  it("offers a choice list when the case supplies options", () => {
    const fake = fakeSource();
    render(
      <PracticeScreen
        source={fake.source}
        caseView={{ ...CASE, decision_options: ["Option A", "Option B"] }}
        sessionId={null}
      />
    );
    const select = screen.getByLabelText("Decision");
    expect(select.tagName).toBe("SELECT");
    expect(within(select).getAllByRole("option").map(o => o.textContent)).toEqual(["Choose…", "Option A", "Option B"]);
  });

  it("opens a cited expert example with the verbatim quote", async () => {
    const t = setup();
    await t.fill();
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    await t.resolveReview(0, "intervene", {
      citations: [
        {
          entry_id: "e1",
          revision_id: "r1",
          quote: { exchange_id: "x1", text: "Expert verbatim words." },
          evidence: {
            event_id: null,
            asset: { ...CASE.asset, asset_id: "ea", frame_id: "frame-a" },
            region: {
              frame_id: "frame-a",
              coordinate_space: "original_frame_normalized",
              x: 0.1,
              y: 0.1,
              width: 0.2,
              height: 0.2,
              mapping_status: "resolved",
            },
          },
        },
      ],
    });
    await t.user.click(screen.getByRole("button", { name: "Open expert example 1" }));
    const dialog = screen.getByRole("dialog", { name: "Expert example" });
    expect(within(dialog).getByText("Expert verbatim words.")).toBeInTheDocument();
    expect(within(dialog).getByText("Expert's words (verbatim)")).toBeInTheDocument();
  });

  it("a revoked expert entry disappears from the cited examples and the review must be repeated", async () => {
    const t = setup();
    await t.fill();
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    await t.resolveReview(0, "intervene", {
      citations: [
        { entry_id: "e1", revision_id: "r1", quote: { exchange_id: "x1", text: "Revoked expert words." }, evidence: null },
        { entry_id: "e2", revision_id: "r1", quote: { exchange_id: "x2", text: "Still valid words." }, evidence: null },
      ],
    });
    expect(screen.getByText(/Revoked expert words/)).toBeInTheDocument();

    t.fake.emit({ type: "knowledge", entry_id: "e1", revision_id: "r1", status: "revoked" });

    expect(screen.queryByText(/Revoked expert words/)).toBeNull();
    expect(screen.getByText(/Still valid words/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Open expert example/ })).toHaveLength(1);
    expect(screen.getByTestId("revoked-notice")).toHaveTextContent(/removed from teaching/);
    expect(t.status()).toHaveTextContent("Draft changed / not yet reviewed");
  });

  it("a revocation of an entry the review did not cite leaves the review alone", async () => {
    const t = setup();
    await t.reachReviewComplete();
    t.fake.emit({ type: "knowledge", entry_id: "unrelated", revision_id: "r1", status: "revoked" });
    expect(t.saveButton()).toBeEnabled();
    expect(screen.queryByTestId("revoked-notice")).toBeNull();
  });
});
