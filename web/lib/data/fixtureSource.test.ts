import { describe, expect, it } from "vitest";
import {
  FIXTURE_IDS,
  createFixtureSource,
  fixtureSource,
} from "@/lib/data/fixtureSource";
import type { LearnerDraft, LearnerEvaluation } from "@/lib/ui/contracts";

describe("fixtureSource", () => {
  it("serves every fixture view labelled as fixture data", async () => {
    const views = await Promise.all([
      fixtureSource.getSession(FIXTURE_IDS.expertSession),
      fixtureSource.getWorkMap(FIXTURE_IDS.expertSession),
      fixtureSource.getPracticeCase(FIXTURE_IDS.practiceCase),
      fixtureSource.getAssessment(FIXTURE_IDS.newcomerSession),
    ]);
    for (const view of views) expect(view.source).toBe("fixture");
  });

  it("has a Work Map with ≥3 steps including a guardrail and an unresolved step", async () => {
    const map = await fixtureSource.getWorkMap(FIXTURE_IDS.expertSession);
    expect(map.steps.length).toBeGreaterThanOrEqual(3);
    expect(map.steps.some(s => s.kind === "guardrail")).toBe(true);
    expect(map.steps.some(s => s.status === "unresolved")).toBe(true);
  });

  it("rejects unknown ids so screens show an error state", async () => {
    await expect(fixtureSource.getSession("nope")).rejects.toThrow(/unknown session/i);
    await expect(fixtureSource.getPracticeCase("nope")).rejects.toThrow(/unknown case/i);
  });

  it("returns copies, so callers cannot mutate the fixtures", async () => {
    const a = await fixtureSource.getWorkMap(FIXTURE_IDS.expertSession);
    a.steps[0].title = "mutated";
    const b = await fixtureSource.getWorkMap(FIXTURE_IDS.expertSession);
    expect(b.steps[0].title).not.toBe("mutated");
  });

  it("stubs later-sprint actions explicitly", async () => {
    await expect(fixtureSource.requestOffRecord(FIXTURE_IDS.expertSession, true)).rejects.toThrow(
      "not implemented: Sprint 3"
    );
  });

  it("simulates review and commit for practice (Sprint 2)", async () => {
    const source = createFixtureSource({ latencyMs: 0 });
    const draft: LearnerDraft = { draft_id: "d", draft_revision: 1, decision: "x", reason: "y", region: null };
    const first = await source.submitDraftForReview(draft);
    expect(first.status === "acknowledged" && first.value.outcome).toBe("intervene");
    const edited = { ...draft, draft_revision: 2 };
    const second = await source.submitDraftForReview(edited);
    if (second.status !== "acknowledged") throw new Error("expected ack");
    const commit = await source.commitDraft(edited, second.value, { idempotency_key: "k" });
    expect(commit.status).toBe("acknowledged");
  });

  it("can force review and commit failures", async () => {
    const source = createFixtureSource({ latencyMs: 0, failReview: true, failCommit: true });
    const draft: LearnerDraft = { draft_id: "d", draft_revision: 1, decision: "x", reason: "y", region: null };
    expect((await source.submitDraftForReview(draft)).status).toBe("failed");
    expect((await source.commitDraft(draft, {} as LearnerEvaluation, { idempotency_key: "k" })).status).toBe("failed");
  });

  it("subscribe returns an unsubscribe function", () => {
    const unsubscribe = fixtureSource.subscribe(FIXTURE_IDS.expertSession, () => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});
