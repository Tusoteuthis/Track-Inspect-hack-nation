import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseConfirmationPost,
  parseConfirmationRequest,
  parseGap,
  parseJob,
  parseKnowledgeRevision,
  parseStatusTransition,
} from "./index";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "ws6", name), "utf8")) as Record<string, unknown>;

const request = {
  reviewed_revision_ids: ["rev-20261004101500-a3f9k2"],
  result: "confirmed",
  expert_response_exchange_id: "x-teach-1",
  idempotency_key: "teach-back-1",
};

describe("KnowledgeRevision S2 fields", () => {
  it("keeps S0 fixtures valid (fields are optional)", () => {
    expect(parseKnowledgeRevision(fixture("knowledge-revision.json")).ok).toBe(true);
  });
  it("accepts session_id, content_sha256 and change_reason", () => {
    const r = parseKnowledgeRevision({
      ...fixture("knowledge-revision.json"),
      session_id: "ses-1",
      content_sha256: "a".repeat(64),
      change_reason: null,
    });
    expect(r.ok).toBe(true);
  });
  it("rejects a malformed sha256", () => {
    expect(parseKnowledgeRevision({ ...fixture("knowledge-revision.json"), content_sha256: "xyz" }).ok).toBe(false);
  });
});

describe("ConfirmationRequest", () => {
  it("accepts the WS6 form", () => expect(parseConfirmationRequest(request).ok).toBe(true));
  it.each([
    { ...request, reviewed_revision_ids: [] },
    { ...request, result: "maybe" },
    { ...request, idempotency_key: "" },
    { ...request, idempotency_key: "has space" },
    { ...request, extra: 1 },
    { ...request, expert_response_exchange_id: undefined },
  ])("rejects %j", body => expect(parseConfirmationRequest(body).ok).toBe(false));
  it("ConfirmationPost also accepts a WS3 ExpertConfirmation", () => {
    expect(parseConfirmationPost(fixture("expert-confirmation.json")).ok).toBe(true);
    expect(parseConfirmationPost(request).ok).toBe(true);
  });
});

describe("Job, Gap, StatusTransition", () => {
  it("parses a job record", () => {
    const job = {
      job_id: "job-20261004101500-a3f9k2",
      session_id: "ses-1",
      kind: "synthesis",
      status: "running",
      module: { id: "ws5-synthesis", version: "0.2.0", source: "live" },
      input_revs: { event_ids: ["evt-1"], exchanges: { "x-1": 2 }, entries: {}, confirmation_ids: [] },
      revision_ids: [],
      created_at_utc: "2026-10-04T10:15:00.000Z",
      started_at_utc: null,
      finished_at_utc: null,
      error: null,
      discard_reason: null,
    };
    expect(parseJob(job).ok).toBe(true);
    expect(parseJob({ ...job, status: "paused" }).ok).toBe(false);
  });
  it("parses a WS5 gap and rejects an out-of-range priority", () => {
    const gap = {
      gap_id: "gap-missing_reason-evt-002",
      kind: "missing_reason",
      description: "No reason given.",
      related_event_ids: ["evt-002"],
      related_exchange_ids: [],
      priority: 2,
    };
    expect(parseGap(gap).ok).toBe(true);
    expect(parseGap({ ...gap, priority: 4 }).ok).toBe(false);
  });
  it("parses a status transition", () => {
    expect(
      parseStatusTransition({
        entry_id: "ent-1",
        revision_id: "rev-1",
        from: "draft",
        to: "confirmed",
        at_utc: "2026-10-04T10:15:00.000Z",
        confirmation_id: "cnf-1",
      }).ok,
    ).toBe(true);
  });
});
