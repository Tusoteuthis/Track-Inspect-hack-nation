import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineCommit, type TimelineDraft, type TimelineEvaluation } from "../timeline";

const t = (s: number) => new Date(Date.UTC(2026, 9, 4, 10, 0, s)).toISOString();

const draft = (draft_rev: number, s: number): TimelineDraft => ({ draft_rev, updated_at_utc: t(s) });
const evaluation = (id: string, draft_rev: number, outcome: string | null, s: number, status: TimelineEvaluation["status"] = "done"): TimelineEvaluation => ({
  evaluation_id: id,
  draft_rev,
  status,
  outcome,
  created_at_utc: t(s - 1),
  updated_at_utc: t(s),
});
const commit = (draft_rev: number, evaluation_id: string, s: number): TimelineCommit => ({ commit_id: `c-${draft_rev}`, draft_rev, evaluation_id, at_utc: t(s) });

describe("buildTimeline", () => {
  it("orders proposed → evaluated → guidance → revised → evaluated → committed and marks the catch before save", () => {
    const tl = buildTimeline(
      [draft(2, 30), draft(1, 10)],
      [evaluation("ev-2", 2, "ok", 40), evaluation("ev-1", 1, "intervene", 20)],
      [commit(2, "ev-2", 50)]
    );
    expect(tl.map(e => [e.kind, e.draft_rev])).toEqual([
      ["proposed", 1],
      ["evaluated", 1],
      ["guidance_delivered", 1],
      ["revised", 2],
      ["evaluated", 2],
      ["committed", 2],
    ]);
    expect(tl[1]).toMatchObject({ evaluation_id: "ev-1", outcome: "intervene", intervention: "caught_before_save" });
    expect(tl[4]).toMatchObject({ outcome: "ok" });
    expect(tl[4].intervention).toBeUndefined();
  });

  it("marks an intervene that comes after a save as discovered after save", () => {
    const tl = buildTimeline([draft(1, 10), draft(2, 70)], [evaluation("ev-1", 1, "ok", 20), evaluation("ev-2", 2, "intervene", 80)], [
      commit(1, "ev-1", 30),
    ]);
    expect(tl.find(e => e.evaluation_id === "ev-2")).toMatchObject({ kind: "evaluated", intervention: "discovered_after_save" });
  });

  it("uses explicit guidance deliveries when given (e.g. when voice spoke the feedback)", () => {
    const tl = buildTimeline([draft(1, 10)], [evaluation("ev-1", 1, "intervene", 20)], [], [{ evaluation_id: "ev-1", at_utc: t(25) }]);
    expect(tl.find(e => e.kind === "guidance_delivered")).toMatchObject({ at_utc: t(25), evaluation_id: "ev-1" });
    const none = buildTimeline([draft(1, 10)], [evaluation("ev-1", 1, "intervene", 20)], [], []);
    expect(none.some(e => e.kind === "guidance_delivered")).toBe(false);
  });

  it("delivers guidance for uncertain too, but not for ok", () => {
    const tl = buildTimeline([draft(1, 10), draft(2, 30)], [evaluation("ev-1", 1, "uncertain", 20), evaluation("ev-2", 2, "ok", 40)], []);
    expect(tl.filter(e => e.kind === "guidance_delivered").map(e => e.evaluation_id)).toEqual(["ev-1"]);
  });

  it("leaves out pending and failed evaluations, keeps stale ones that were delivered", () => {
    const tl = buildTimeline(
      [draft(1, 10)],
      [evaluation("ev-p", 1, null, 20, "pending"), evaluation("ev-f", 1, null, 21, "failed"), evaluation("ev-s", 1, "intervene", 22, "stale")],
      []
    );
    expect(tl.filter(e => e.kind === "evaluated").map(e => e.evaluation_id)).toEqual(["ev-s"]);
  });

  it("is pure: does not mutate inputs and is stable under input order", () => {
    const drafts = [draft(1, 10), draft(2, 30)];
    const evals = [evaluation("ev-1", 1, "intervene", 20), evaluation("ev-2", 2, "ok", 40)];
    const commits = [commit(2, "ev-2", 50)];
    const snapshot = JSON.stringify([drafts, evals, commits]);
    const a = buildTimeline(drafts, evals, commits);
    const b = buildTimeline([...drafts].reverse(), [...evals].reverse(), commits);
    expect(b).toEqual(a);
    expect(JSON.stringify([drafts, evals, commits])).toBe(snapshot);
  });
});
