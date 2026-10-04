import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  ApiErrorBodySchema,
  AssessmentSchema,
  BusEventSchema,
  CommitSchema,
  ConfirmationSchema,
  CoverageItemSchema,
  DraftRevisionSchema,
  ERROR_STATUS,
  ErrorCodeSchema,
  EvaluationSchema,
  EvidenceAssetSchema,
  ExpertConfirmationSchema,
  ExpertExchangeIngestSchema,
  IdSchema,
  KnowledgeEntrySchema,
  KnowledgeRevisionSchema,
  LearnerDraftSchema,
  OpenQuestionSchema,
  PointingEventIngestSchema,
  PointingEventSchema,
  RecordingSegmentSchema,
  SCHEMA_VERSION,
  SessionSchema,
  TimingMarkSchema,
  makeParser,
  parseBusEvent,
  parsePointingEvent,
  parseSession,
  toConfirmation,
  type ExpertConfirmation,
} from "./index";

const webDir = join(__dirname, "..", "..");
const ws6Dir = join(webDir, "fixtures", "ws6");
const ws3Dir = join(webDir, "fixtures", "pointing-events");

const readJson = (dir: string, file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
const ws6 = (file: string) => structuredClone(readJson(ws6Dir, file));

const FIXTURE_SCHEMAS: Record<string, z.ZodType> = {
  "session.json": SessionSchema,
  "session-newcomer.json": SessionSchema,
  "evidence-asset.json": EvidenceAssetSchema,
  "pointing-event.json": PointingEventIngestSchema,
  "expert-exchange.json": ExpertExchangeIngestSchema,
  "draft-revision.json": DraftRevisionSchema,
  "expert-confirmation.json": ExpertConfirmationSchema,
  "knowledge-entry.json": KnowledgeEntrySchema,
  "knowledge-revision.json": KnowledgeRevisionSchema,
  "confirmation.json": ConfirmationSchema,
  "learner-draft.json": LearnerDraftSchema,
  "evaluation.json": EvaluationSchema,
  "commit.json": CommitSchema,
  "assessment.json": AssessmentSchema,
  "bus-event.json": BusEventSchema,
  "api-error.json": ApiErrorBodySchema,
  "recording-segment.json": RecordingSegmentSchema,
  "timing-mark.json": TimingMarkSchema,
  "coverage-item.json": CoverageItemSchema,
  "open-question.json": OpenQuestionSchema,
};

describe("ws6 fixtures", () => {
  it("has exactly one mapped schema per JSON fixture", () => {
    const files = readdirSync(ws6Dir).filter(f => f.endsWith(".json")).sort();
    expect(files).toEqual(Object.keys(FIXTURE_SCHEMAS).sort());
  });

  it.each(Object.entries(FIXTURE_SCHEMAS))("%s parses with its schema", (file, schema) => {
    const result = makeParser(schema)(ws6(file));
    expect(result.ok ? [] : result.error.issues).toEqual([]);
  });

  it.each(Object.keys(FIXTURE_SCHEMAS))("%s is labelled as a fixture", file => {
    const data = ws6(file);
    if ("source" in data) expect(data.source).toBe("fixture");
    const producedBy = data.produced_by as { source?: unknown } | undefined;
    if (producedBy) expect(producedBy.source).toBe("fixture");
    if ("session_id" in data) expect(data.session_id).toBe("fixture-session-001");
  });

  it("README states the fixtures are not real expert knowledge", () => {
    const readme = readFileSync(join(ws6Dir, "README.md"), "utf8");
    expect(readme).toMatch(/fixture/i);
    expect(readme).toMatch(/never real expert knowledge/i);
  });

  it("keeps IDs consistent across files", () => {
    const event = ws6("pointing-event.json");
    const asset = ws6("evidence-asset.json");
    const exchange = ws6("expert-exchange.json");
    const entry = ws6("knowledge-entry.json");
    const revision = ws6("knowledge-revision.json");
    expect(event.asset_id).toBe(asset.asset_id);
    expect(asset.event_id).toBe(event.event_id);
    expect(event.image_ref).toBe(`/api/assets/${String(asset.asset_id)}/original`);
    expect(event.highlighted_image_ref).toBe(`/api/assets/${String(asset.asset_id)}/highlighted`);
    expect(exchange.event_id).toBe(event.event_id);
    expect(entry.current_revision_id).toBe(revision.revision_id);
    expect(entry.entry_id).toBe(revision.entry_id);
  });

  it("knowledge-revision.md frontmatter parses and equals the JSON fixture", () => {
    const md = readFileSync(join(ws6Dir, "knowledge-revision.md"), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(md);
    expect(match).not.toBeNull();
    const frontmatter: unknown = JSON.parse(match![1]);
    const result = KnowledgeRevisionSchema.safeParse(frontmatter);
    expect(result.success).toBe(true);
    expect(frontmatter).toEqual(ws6("knowledge-revision.json"));
    expect(md.slice(match![0].length)).toMatch(/FIXTURE/);
  });
});

function pngInfo(file: string): { sha256: string; width: number; height: number } {
  const buf = readFileSync(join(ws6Dir, file));
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe("evidence asset fixture matches the PNG files", () => {
  const asset = EvidenceAssetSchema.parse(ws6("evidence-asset.json"));

  it("original", () => {
    const png = pngInfo("fixture-frame.png");
    expect(asset.original).toMatchObject({ sha256: png.sha256, width_px: png.width, height_px: png.height });
  });

  it("highlighted", () => {
    const png = pngInfo("fixture-frame-highlighted.png");
    expect(asset.highlighted).toMatchObject({ sha256: png.sha256, width_px: png.width, height_px: png.height });
  });

  it("PNGs carry the FIXTURE tEXt comment", () => {
    for (const f of ["fixture-frame.png", "fixture-frame-highlighted.png"]) {
      expect(readFileSync(join(ws6Dir, f)).toString("latin1")).toContain("FIXTURE placeholder, not real capture");
    }
  });
});

describe("WS3 compatibility", () => {
  const ws3Files = readdirSync(ws3Dir).filter(f => f.endsWith(".json")).sort();

  it.each(ws3Files)("WS3 fixture %s parses with PointingEventSchema", file => {
    const result = parsePointingEvent(readJson(ws3Dir, file));
    expect(result.ok ? [] : result.error.issues).toEqual([]);
  });

  it("ws6 pointing-event fixture also parses as a plain WS3 event (asset_id stripped)", () => {
    const result = PointingEventSchema.safeParse(ws6("pointing-event.json"));
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("asset_id");
  });

  it("SCHEMA_VERSION is ws6.v0", () => {
    expect(SCHEMA_VERSION).toBe("ws6.v0");
  });
});

describe("rejections", () => {
  const event = () => ws6("pointing-event.json");
  const issuesFor = (input: unknown) => {
    const r = parsePointingEvent(input);
    return r.ok ? [] : r.error.issues;
  };
  const withRegion = (patch: Record<string, unknown>) => {
    const e = event();
    e.region = { ...(e.region as object), ...patch };
    return e;
  };

  it("missing event_id", () => {
    const e = event();
    delete e.event_id;
    expect(issuesFor(e).map(i => i.path)).toContain("event_id");
  });

  it("missing session_id", () => {
    const s = ws6("session.json");
    delete s.session_id;
    const r = parseSession(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues.map(i => i.path)).toContain("session_id");
  });

  it("bad enum mapping_status", () => {
    expect(issuesFor({ ...event(), mapping_status: "maybe" }).map(i => i.path)).toContain("mapping_status");
  });

  it("bad enum role", () => {
    expect(SessionSchema.safeParse({ ...ws6("session.json"), role: "admin" }).success).toBe(false);
  });

  it.each([
    ["x=-0.1", { x: -0.1 }],
    ["x=1.1", { x: 1.1 }],
    ["x+width>1", { x: 0.9, width: 0.2 }],
    ["width 0", { width: 0 }],
    ["y+height>1", { y: 0.9, height: 0.2 }],
    ["wrong coordinate_space", { coordinate_space: "screen" }],
    ["non-integer frame width", { frame_width_px: 320.5 }],
  ])("region %s", (_name, patch) => {
    const issues = issuesFor(withRegion(patch));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(i => i.path.startsWith("region"))).toBe(true);
  });

  it.each(["../x", "A-B", "a/b", "-a", "", "a".repeat(65)])("id %j", id => {
    expect(IdSchema.safeParse(id).success).toBe(false);
    expect(issuesFor({ ...event(), event_id: id }).map(i => i.path)).toContain("event_id");
  });

  it("accepts a 64-char id", () => {
    expect(IdSchema.safeParse("a".repeat(64)).success).toBe(true);
  });

  it("empty-string trace_id and channel_id", () => {
    expect(issuesFor({ ...event(), trace_id: "" }).map(i => i.path)).toContain("trace_id");
    expect(issuesFor({ ...event(), channel_id: "" }).map(i => i.path)).toContain("channel_id");
  });

  it("signal_interval key is required but nullable", () => {
    const e = event();
    delete e.signal_interval;
    expect(issuesFor(e).map(i => i.path)).toContain("signal_interval");
    expect(issuesFor({ ...event(), signal_interval: { start: 2, end: 1, unit: "s" } }).length).toBeGreaterThan(0);
    expect(issuesFor({ ...event(), signal_interval: { start: 1, end: 2, unit: "" } }).length).toBeGreaterThan(0);
    expect(issuesFor({ ...event(), signal_interval: { start: 1, end: 2, unit: "s" } })).toEqual([]);
  });

  it("wrong schema_version", () => {
    expect(issuesFor({ ...event(), schema_version: "ws6.v0" }).map(i => i.path)).toContain("schema_version");
  });

  it("BusEvent with an extra text key", () => {
    const r = parseBusEvent({ ...ws6("bus-event.json"), text: "FIXTURE content" });
    expect(r.ok).toBe(false);
  });

  it("asset file path with traversal", () => {
    const a = ws6("evidence-asset.json");
    a.original = { ...(a.original as object), path: "../original.png" };
    expect(EvidenceAssetSchema.safeParse(a).success).toBe(false);
  });

  it("expert session with pinned_knowledge", () => {
    const s = { ...ws6("session.json"), pinned_knowledge: ws6("session-newcomer.json").pinned_knowledge };
    expect(SessionSchema.safeParse(s).success).toBe(false);
  });
});

describe("ParseResult", () => {
  it("returns value on success", () => {
    const r = parseSession(ws6("session.json"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.session_id).toBe("fixture-session-001");
  });

  it("reports dotted paths with numeric indices", () => {
    const x = ws6("expert-exchange.json");
    (x.answer_lines as Record<string, unknown>[])[0].text = 42;
    const r = makeParser(ExpertExchangeIngestSchema)(x);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("validation_failed");
      expect(r.error.message.length).toBeGreaterThan(0);
      expect(r.error.issues).toContainEqual(expect.objectContaining({ path: "answer_lines.0.text" }));
    }
  });
});

describe("errors", () => {
  it("maps every error code to an HTTP status", () => {
    expect(ErrorCodeSchema.options).toEqual([
      "validation_failed",
      "unauthorized",
      "off_record",
      "not_found",
      "conflict_immutable",
      "asset_not_available",
      "stale_revision",
      "evaluation_required",
      "evaluation_pending",
      "evaluation_stale",
      "commit_blocked",
      "invalid_transition",
      "internal",
      "no_confirmed_knowledge",
      "case_not_permitted",
      "knowledge_changed",
      "blocked_by_outcome",
      "already_committed",
    ]);
    expect(ERROR_STATUS).toMatchObject({
      validation_failed: 400,
      unauthorized: 401,
      off_record: 403,
      not_found: 404,
      conflict_immutable: 409,
      asset_not_available: 409,
      invalid_transition: 409,
      internal: 500,
    });
  });
});

describe("toConfirmation", () => {
  it("maps revision_id → reviewed_revision_id and status → result", () => {
    const c = ExpertConfirmationSchema.parse(ws6("expert-confirmation.json")) satisfies ExpertConfirmation;
    const mapped = toConfirmation(c, "fixture");
    expect(mapped).toEqual({
      confirmation_id: c.confirmation_id,
      reviewed_revision_id: c.revision_id,
      result: c.status,
      expert_response_exchange_id: c.expert_response_exchange_id,
      at_utc: c.at_utc,
      step_ids_reviewed: c.step_ids_reviewed,
      source: "fixture",
    });
    expect(ConfirmationSchema.safeParse(mapped).success).toBe(true);
  });
});
