import { describe, expect, it } from "vitest";
import {
  mapAssessment,
  mapEvaluation,
  mapPointingEvent,
  mapSession,
  mapWorkMap,
  mapWorkMapStep,
  parseApiError,
  withBase,
} from "@/lib/data/ws6Mappers";
import type {
  Ws6Assessment,
  Ws6Evaluation,
  Ws6PointingEvent,
  Ws6Session,
  Ws6WorkMapStep,
  Ws6WorkMapView,
} from "@/lib/data/ws6Wire";

const BASE = "http://laptop:3006";

const session = (over: Partial<Ws6Session> = {}): Ws6Session => ({
  session_id: "ses-1",
  role: "expert",
  lifecycle: "created",
  record_state: "on_record",
  case_id: null,
  trace_ref: "case-a",
  pinned_knowledge: null,
  source: "live",
  created_at_utc: "2026-10-04T10:00:00Z",
  rev: 1,
  ...over,
});

const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4, coordinate_space: "original_frame_normalized" as const, frame_width_px: 1280, frame_height_px: 720 };

const content = {
  position: 1,
  entry_id: "ent-1",
  revision_id: "rev-1",
  status: "draft",
  kind: "decision",
  title: "Check the baseline",
  expert_words: [{ exchange_id: "x-1", question: "Why?", quote: "I always look at the baseline first" }],
  synthesis: [
    { type: "ai_synthesis", text: "Baseline is checked first." },
    { type: "ai_synthesis", text: "Then the peak." },
  ],
  guardrails: [
    {
      trigger: { type: "expert_quote", exchange_id: "x-1", quote: "the baseline drifts" },
      action: { type: "ai_synthesis", text: "stop and recalibrate" },
      expert_words: [],
    },
  ],
  visual: [],
  confirmation: null,
  broken_links: [],
};

const step = (over: Partial<Ws6WorkMapStep> = {}): Ws6WorkMapStep => ({
  position: 1,
  entry_id: "ent-1",
  revision_id: "rev-1",
  revision_no: 1,
  status: "draft",
  is_current: true,
  source: "live",
  title: "Check the baseline",
  evidence: [
    { event_id: "evt-1", asset_id: "ast-1", original_url: "/api/assets/ast-1/original", highlighted_url: "/api/assets/ast-1/highlighted", region },
  ],
  exchanges: [
    {
      exchange_id: "x-1",
      question: "Why?",
      answer_lines: [
        { text: "I always look", at_utc: "2026-10-04T10:00:01Z", transcript_line_id: "l-1" },
        { text: "at the baseline first", at_utc: "2026-10-04T10:00:02Z", transcript_line_id: "l-2" },
      ],
    },
  ],
  content,
  broken_links: [],
  ...over,
});

const workmap = (over: Partial<Ws6WorkMapView> = {}): Ws6WorkMapView => ({
  include: "draft",
  produced_by: { id: "ws5-synthesis", version: "0.2.0", source: "live" },
  session_id: "ses-1",
  job_id: "job-1",
  generated_at_utc: "2026-10-04T10:05:00Z",
  steps: [step()],
  excluded: [],
  ...over,
});

describe("withBase", () => {
  it("prefixes relative URLs and leaves absolute ones alone", () => {
    expect(withBase(BASE, "/api/assets/a/original")).toBe(`${BASE}/api/assets/a/original`);
    expect(withBase("", "/api/assets/a/original")).toBe("/api/assets/a/original");
    expect(withBase(BASE, "https://cdn/x.png")).toBe("https://cdn/x.png");
  });
});

describe("mapSession", () => {
  it.each([
    ["created", "not_started"],
    ["active", "active"],
    ["ended", "ended"],
    ["aborted", "ended"],
  ] as const)("maps lifecycle %s → %s", (from, to) => {
    expect(mapSession(session({ lifecycle: from }), "connected").lifecycle).toBe(to);
  });

  it("maps record state, connection, rev, source and pinned knowledge", () => {
    const view = mapSession(
      session({
        record_state: "off_record",
        rev: 4,
        source: "stub",
        role: "newcomer",
        case_id: "case-a",
        pinned_knowledge: [
          { entry_id: "e1", revision_id: "rev-9" },
          { entry_id: "e2", revision_id: "rev-10" },
        ],
      }),
      "reconnecting"
    );
    expect(view).toEqual({
      session_id: "ses-1",
      role: "newcomer",
      lifecycle: "not_started",
      recording_state: "off_record",
      connection: { capture: "unknown", agent: "unknown", backend: "reconnecting" },
      case_id: "case-a",
      knowledge_revision_id: "rev-9",
      rev: 4,
      source: "stub",
    });
  });

  it("has no knowledge revision for expert sessions", () => {
    expect(mapSession(session(), "unknown").knowledge_revision_id).toBeNull();
  });
});

describe("mapWorkMapStep", () => {
  it("maps WS5 content: verbatim quotes, separate AI summary, guardrail sentences", () => {
    const s = mapWorkMapStep(step(), BASE);
    expect(s.entry_id).toBe("ent-1");
    expect(s.revision_id).toBe("rev-1");
    expect(s.kind).toBe("decision");
    expect(s.title).toBe("Check the baseline");
    expect(s.ai_summary).toBe("Baseline is checked first. Then the peak.");
    expect(s.expert_quotes).toEqual([{ exchange_id: "x-1", text: "I always look at the baseline first" }]);
    expect(s.reasoning).toBeNull();
    expect(s.guardrails).toEqual(["When the baseline drifts: stop and recalibrate"]);
    expect(s.status).toBe("draft");
    expect(s.open_question).toBeNull();
  });

  it("maps evidence onto the asset's own frame with base-prefixed URLs", () => {
    const [ev] = mapWorkMapStep(step(), BASE).evidence;
    expect(ev.event_id).toBe("evt-1");
    expect(ev.asset).toEqual({
      asset_id: "ast-1",
      original_url: `${BASE}/api/assets/ast-1/original`,
      highlighted_url: `${BASE}/api/assets/ast-1/highlighted`,
      frame_id: "asset:ast-1",
      width_px: 1280,
      height_px: 720,
    });
    expect(ev.region).toEqual({
      frame_id: "asset:ast-1",
      coordinate_space: "original_frame_normalized",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      mapping_status: "resolved",
    });
  });

  it("keeps a null highlighted URL null", () => {
    const s = step({ evidence: [{ ...step().evidence[0], highlighted_url: null }] });
    expect(mapWorkMapStep(s, BASE).evidence[0].asset.highlighted_url).toBeNull();
  });

  it("maps escalation to guardrail and unknown kinds to step", () => {
    expect(mapWorkMapStep(step({ content: { ...content, kind: "escalation" } }), BASE).kind).toBe("guardrail");
    expect(mapWorkMapStep(step({ content: { ...content, kind: "mystery" } }), BASE).kind).toBe("step");
  });

  it("falls back to verbatim answer lines when there is no WS5 content", () => {
    const s = mapWorkMapStep(step({ content: null, title: null }), BASE);
    expect(s.title).toBe("Untitled item");
    expect(s.ai_summary).toBeNull();
    expect(s.guardrails).toEqual([]);
    expect(s.kind).toBe("step");
    expect(s.expert_quotes).toEqual([{ exchange_id: "x-1", text: "I always look at the baseline first" }]);
  });

  it("skips exchanges without answer lines in the fallback", () => {
    const s = mapWorkMapStep(step({ content: null, exchanges: [{ exchange_id: "x-2", question: "?", answer_lines: [] }] }), BASE);
    expect(s.expert_quotes).toEqual([]);
  });

  it("marks a step with a missing revision or status as missing", () => {
    const s = mapWorkMapStep(step({ revision_id: null }), BASE);
    expect(s.status).toBe("missing");
    expect(s.revision_id).toBe("");
    expect(mapWorkMapStep(step({ status: null }), BASE).status).toBe("missing");
  });

  it("passes WS6 status through, also for superseded revisions", () => {
    expect(mapWorkMapStep(step({ status: "confirmed", is_current: false }), BASE).status).toBe("confirmed");
    expect(mapWorkMapStep(step({ status: "unresolved" }), BASE).status).toBe("unresolved");
  });

  it("ignores malformed content fields instead of throwing", () => {
    const s = mapWorkMapStep(step({ content: { kind: 3, expert_words: "nope", synthesis: [{ text: 5 }], guardrails: [{}] } }), BASE);
    expect(s.kind).toBe("step");
    expect(s.expert_quotes).toEqual([]);
    expect(s.ai_summary).toBeNull();
    expect(s.guardrails).toEqual([]);
  });
});

describe("mapWorkMap", () => {
  it("adapts the global Work Map to a session-scoped view", () => {
    const view = mapWorkMap(workmap(), "ses-req", BASE);
    expect(view.session_id).toBe("ses-1");
    expect(view.revision_id).toBe("job-1");
    expect(view.revision_label).toBe("Current Work Map");
    expect(view.parent_revision_id).toBeNull();
    expect(view.change_reason).toBeNull();
    expect(view.source).toBe("live");
    expect(view.steps).toHaveLength(1);
  });

  it("falls back to the requested session and generated time", () => {
    const view = mapWorkMap(workmap({ session_id: null, job_id: null }), "ses-req", BASE);
    expect(view.session_id).toBe("ses-req");
    expect(view.revision_id).toBe("2026-10-04T10:05:00Z");
    expect(mapWorkMap(workmap({ job_id: null, generated_at_utc: null }), "s", BASE).revision_id).toBe("workmap");
  });

  it("labels the whole map by its least trustworthy step source", () => {
    const steps = (...sources: (Ws6WorkMapStep["source"])[]) => sources.map(source => step({ source }));
    expect(mapWorkMap(workmap({ steps: steps("live", "stub") }), "s", BASE).source).toBe("stub");
    expect(mapWorkMap(workmap({ steps: steps("stub", "fixture", "live") }), "s", BASE).source).toBe("fixture");
    expect(mapWorkMap(workmap({ steps: steps("live", null) }), "s", BASE).source).toBe("live");
  });

  it("uses produced_by.source for an empty map", () => {
    const view = mapWorkMap(workmap({ steps: [], produced_by: { id: "ws6-stub-synthesis", version: "0.1.0", source: "stub" } }), "s", BASE);
    expect(view.source).toBe("stub");
    expect(mapWorkMap(workmap({ steps: [], produced_by: null }), "s", BASE).source).toBe("live");
  });
});

describe("mapPointingEvent", () => {
  it("prefixes the rewritten image refs and passes the rest through", () => {
    const event: Ws6PointingEvent = {
      schema_version: "ws3.v0",
      session_id: "ses-1",
      event_id: "evt-1",
      source: "live",
      captured_at_utc: "2026-10-04T10:00:00Z",
      session_time_ms: 1200,
      frame_id: "frm-1",
      image_ref: "/api/assets/ast-1/original",
      highlighted_image_ref: "/api/assets/ast-1/highlighted",
      region,
      mapping_status: "ambiguous",
      trace_id: null,
      channel_id: null,
      signal_interval: null,
      record_state: "on_record",
      asset_id: "ast-1",
    };
    const mapped = mapPointingEvent(event, BASE);
    expect(mapped.image_ref).toBe(`${BASE}/api/assets/ast-1/original`);
    expect(mapped.highlighted_image_ref).toBe(`${BASE}/api/assets/ast-1/highlighted`);
    expect(mapped.mapping_status).toBe("ambiguous");
    expect(mapped.frame_id).toBe("frm-1");
    expect(mapped.region).toEqual(region);
  });
});

const assessment = (over: Partial<Ws6Assessment> = {}): Ws6Assessment => ({
  session_id: "ses-n",
  initial_decision: "Accept",
  assistance: [],
  final_outcome: "Accepted",
  evidence_used: [{ entry_id: "ent-1", revision_id: "rev-1" }],
  practice_next: ["Top-level practice"],
  source: "live",
  created_at_utc: "2026-10-04T11:00:00Z",
  ...over,
});

const decision = (outcome_class: string, interventions: string[] = [], draft_rev_initial = 1) => ({
  draft_rev_initial,
  outcome_class,
  interventions,
  cited_entries: [{ entry_id: "ent-1", revision_id: "rev-1" }],
});

describe("mapAssessment", () => {
  it("sorts WS5 decisions into independent, assisted and unresolved", () => {
    const view = mapAssessment(
      assessment({
        content: {
          decisions: [
            decision("correct_unassisted"),
            decision("correct_after_help", ["Look at the baseline"], 2),
            decision("unresolved_or_escalated", [], 3),
          ],
          practice_next: ["Content practice"],
          limitations: ["One case is not mastery"],
        },
      })
    );
    expect(view.independent).toHaveLength(1);
    expect(view.assisted).toHaveLength(1);
    expect(view.unresolved).toHaveLength(1);
    expect(view.assisted[0].interventions).toEqual(["Look at the baseline"]);
    expect(view.assisted[0].description).toBe("Decision on draft 2");
    expect(view.independent[0].citations).toEqual([{ entry_id: "ent-1", revision_id: "rev-1", quote: null, evidence: null }]);
    expect(view.practice_next).toEqual(["Content practice"]);
    expect(view.limitations).toEqual(["One case is not mastery"]);
    expect(view.evidence_used).toEqual([{ entry_id: "ent-1", revision_id: "rev-1", quote: null, evidence: null }]);
    expect(view.session_id).toBe("ses-n");
    expect(view.source).toBe("live");
  });

  it("never shows an assisted correction as independent", () => {
    const view = mapAssessment(assessment({ content: { decisions: [decision("correct_unassisted", ["A hint"])] } }));
    expect(view.independent).toHaveLength(0);
    expect(view.assisted).toHaveLength(1);
  });

  it("treats unknown outcome classes as unresolved", () => {
    const view = mapAssessment(assessment({ content: { decisions: [decision("brilliant"), { foo: 1 }] } }));
    expect(view.independent).toHaveLength(0);
    expect(view.unresolved).toHaveLength(2);
  });

  it("falls back to top-level practice_next when content has none", () => {
    const view = mapAssessment(assessment({ content: { decisions: [] } }));
    expect(view.practice_next).toEqual(["Top-level practice"]);
    expect(view.limitations).toEqual([]);
  });

  it("never infers independence from the minimal fields", () => {
    const unassisted = mapAssessment(assessment());
    expect(unassisted.independent).toHaveLength(0);
    expect(unassisted.assisted).toHaveLength(0);
    expect(unassisted.unresolved).toHaveLength(1);

    const helped = mapAssessment(assessment({ assistance: ["Hint 1"] }));
    expect(helped.independent).toHaveLength(0);
    expect(helped.assisted).toHaveLength(1);
    expect(helped.assisted[0].description).toContain("Accepted");
    expect(helped.assisted[0].interventions).toEqual(["Hint 1"]);
  });

  it("does not add an overall score", () => {
    const view = mapAssessment(assessment());
    expect(Object.keys(view).sort()).toEqual(
      ["assisted", "evidence_used", "independent", "limitations", "practice_next", "session_id", "source", "unresolved"].sort()
    );
  });
});

const evaluation = (over: Partial<Ws6Evaluation> = {}): Ws6Evaluation => ({
  evaluation_id: "evl-1",
  session_id: "ses-n",
  draft_rev: 2,
  knowledge_revision_ids: ["rev-1", "rev-2"],
  status: "done",
  outcome: "ok",
  cited: [
    { entry_id: "ent-1", revision_id: "rev-1", exchange_ids: ["x-1"], quote: "I always look" },
    { entry_id: "ent-2", revision_id: "rev-2", exchange_ids: [] },
  ],
  feedback_text: "Well reasoned.",
  guiding_question: null,
  created_at_utc: "2026-10-04T11:00:00Z",
  updated_at_utc: "2026-10-04T11:00:01Z",
  ...over,
});

describe("mapEvaluation", () => {
  it("maps the evaluation and its citations", () => {
    expect(mapEvaluation(evaluation())).toEqual({
      evaluation_id: "evl-1",
      draft_revision: 2,
      knowledge_revision_id: "rev-1,rev-2",
      outcome: "ok",
      message: "Well reasoned.",
      guiding_question: null,
      citations: [
        { entry_id: "ent-1", revision_id: "rev-1", quote: { exchange_id: "x-1", text: "I always look" }, evidence: null },
        { entry_id: "ent-2", revision_id: "rev-2", quote: null, evidence: null },
      ],
    });
  });

  it("fills missing outcome, feedback and guiding question safely", () => {
    const view = mapEvaluation(evaluation({ outcome: null, feedback_text: null, guiding_question: undefined }));
    expect(view.outcome).toBe("failed");
    expect(view.message).toBe("");
    expect(view.guiding_question).toBeNull();
  });
});

describe("parseApiError", () => {
  it("reads the WS6 error envelope", () => {
    expect(parseApiError({ error: { code: "stale_revision", message: "Draft changed." } }, 409)).toEqual({
      code: "stale_revision",
      message: "Draft changed.",
    });
  });

  it("falls back to the HTTP status", () => {
    expect(parseApiError(null, 502)).toEqual({ code: null, message: "HTTP 502" });
    expect(parseApiError({ error: "boom" }, 500)).toEqual({ code: null, message: "HTTP 500" });
  });
});
