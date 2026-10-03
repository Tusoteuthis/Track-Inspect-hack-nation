import { describe, expect, it } from "vitest";
import workmapJson from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import {
  createFixturePractice,
  fixtureCitations,
} from "@/lib/data/fixturePractice";
import type { LearnerDraft, WorkMapView } from "@/lib/ui/contracts";

const workmap = workmapJson as WorkMapView;
const draft = (rev: number, decision = "anything"): LearnerDraft => ({
  draft_id: "d1",
  draft_revision: rev,
  decision,
  reason: "r",
  region: null,
});
const make = (over = {}) =>
  createFixturePractice({ knowledgeRevisionId: "k", workmap, latencyMs: 0, ...over });

describe("fixturePractice", () => {
  it("returns scripted guidance first, then review complete, regardless of draft content", async () => {
    for (const decision of ["A", "totally different"]) {
      const fx = make();
      const first = await fx.submitDraftForReview(draft(1, decision));
      const second = await fx.submitDraftForReview(draft(2, decision));
      expect(first.status === "acknowledged" && first.value.outcome).toBe("intervene");
      expect(second.status === "acknowledged" && second.value.outcome).toBe("ok");
    }
  });

  it("labels its messages as fixture behaviour and echoes the assessed revisions", async () => {
    const ack = await make().submitDraftForReview(draft(3));
    if (ack.status !== "acknowledged") throw new Error("expected ack");
    expect(ack.value.message).toMatch(/^Fixture behaviour:/);
    expect(ack.value.draft_revision).toBe(3);
    expect(ack.value.knowledge_revision_id).toBe("k");
  });

  it("cites a confirmed expert entry with verbatim quote and resolved evidence", () => {
    const [c] = fixtureCitations(workmap);
    const step = workmap.steps.find(s => s.entry_id === c.entry_id)!;
    expect(step.status).toBe("confirmed");
    expect(step.expert_quotes.map(q => q.text)).toContain(c.quote?.text);
    expect(c.evidence?.region?.mapping_status).toBe("resolved");
  });

  it("commits once per idempotency key", async () => {
    const fx = make();
    const ev = await fx.submitDraftForReview(draft(1));
    const ok = await fx.submitDraftForReview(draft(2));
    if (ev.status !== "acknowledged" || ok.status !== "acknowledged") throw new Error();
    const [a, b] = await Promise.all([
      fx.commitDraft(draft(2), ok.value, { idempotency_key: "k1" }),
      fx.commitDraft(draft(2), ok.value, { idempotency_key: "k1" }),
    ]);
    expect(a.status).toBe("acknowledged");
    expect(b.status).toBe("acknowledged");
    expect(fx.commitCount()).toBe(1);
  });

  it("refuses to commit on guidance or a stale evaluation, like the backend", async () => {
    const fx = make();
    const ev = await fx.submitDraftForReview(draft(1));
    if (ev.status !== "acknowledged") throw new Error();
    expect(await fx.commitDraft(draft(1), ev.value, { idempotency_key: "a" })).toEqual({
      status: "failed",
      error: "commit_blocked",
    });
    expect((await fx.commitDraft(draft(2), ev.value, { idempotency_key: "b" })).status).toBe("failed");
    expect(fx.commitCount()).toBe(0);
  });

  it("forced failures and latency are configurable", async () => {
    const fx = make({ failReview: true, failCommit: true, latencyMs: 30 });
    const t0 = Date.now();
    expect((await fx.submitDraftForReview(draft(1))).status).toBe("failed");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });

  it("cites nothing when no knowledge is confirmed (never cites drafts)", () => {
    const drafts = { ...workmap, steps: workmap.steps.map(s => ({ ...s, status: "draft" as const })) };
    expect(fixtureCitations(drafts)).toEqual([]);
  });

  it("acknowledges screen frames with a reference", async () => {
    const ack = await make().submitScreenFrame("c", new Blob(["x"]), { draft_revision: 2, captured_at_utc: "t" });
    expect(ack).toMatchObject({ status: "acknowledged", value: { draft_revision: 2, source: "fixture" } });
  });
});
