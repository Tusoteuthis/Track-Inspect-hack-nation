import { describe, expect, it } from "vitest";
import type { CoverageItem, ExpertExchange, SessionSnapshot, Topic } from "./contracts";
import {
  DEBRIEF_MAX_GAPS,
  applyCoverage,
  coverageGrid,
  debriefAgenda,
  openQuestionsFromTopics,
  selectGaps,
} from "./coverage";

const SID = "ses-20261004-030000-cov1";

function topic(id: string, event: string, over: Partial<Topic> = {}): Topic {
  return {
    topic_id: id,
    session_id: SID,
    primary_event_id: event,
    alias_event_ids: [],
    state: "answered",
    requires_clarification: false,
    record_state: "on_record",
    channel_id: event === "evt-002" ? "SYS2" : "SYS1",
    queued_at_utc: "2026-10-04T03:00:00.000Z",
    queued_at_perf_ms: 0,
    last_event_at_perf_ms: 0,
    released_at_utc: null,
    released_at_perf_ms: null,
    asked_at_perf_ms: null,
    stale_at_release: null,
    release_text: null,
    nudged_at_perf_ms: null,
    exchange_ids: [],
    deferred_reason: null,
    ...over,
  };
}

function exchange(id: string, event: string | null, kind: ExpertExchange["kind"], answered = true): ExpertExchange {
  return {
    exchange_id: id,
    session_id: SID,
    event_id: event,
    topic_id: null,
    related_event_ids: [],
    phase: "live",
    kind,
    question: "Q?",
    question_planned: null,
    answer_lines: answered ? [{ text: "An answer.", at_utc: "2026-10-04T03:00:05.000Z", transcript_line_id: `u-${id}` }] : [],
    gap_id: null,
    revision_id: null,
    asked_at_utc: "2026-10-04T03:00:04.000Z",
    answer_started_at_utc: null,
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    record_state: "on_record",
    source: "fixture",
    outcome: null,
  };
}

type Snap = Pick<SessionSnapshot, "topics" | "coverage" | "exchanges" | "open_questions">;
const snap = (over: Partial<Snap> = {}): Snap => ({ topics: [], coverage: [], exchanges: [], open_questions: [], ...over });

const cell = (items: CoverageItem[], event: string | null, dim: string) =>
  items.find(c => c.event_id === event && c.dimension === dim)!;

describe("applyCoverage (monotonic)", () => {
  it("creates, upgrades and links exchanges", () => {
    let items = applyCoverage([], { event_id: "evt-001", dimension: "reason", status: "partial", exchange_id: "ex-001", note: "width", resolution: null });
    expect(cell(items, "evt-001", "reason")).toMatchObject({ status: "partial", supporting_exchange_ids: ["ex-001"], note: "width" });
    items = applyCoverage(items, { event_id: "evt-001", dimension: "reason", status: "covered", exchange_id: "ex-002", note: null, resolution: "answered" });
    expect(cell(items, "evt-001", "reason")).toMatchObject({
      status: "covered",
      supporting_exchange_ids: ["ex-001", "ex-002"],
      note: "width",
      resolution: "answered",
    });
  });

  it("never downgrades, but still records the supporting exchange", () => {
    let items = applyCoverage([], { event_id: null, dimension: "guardrails", status: "covered", exchange_id: "ex-003", note: "stop", resolution: "answered" });
    items = applyCoverage(items, { event_id: null, dimension: "guardrails", status: "partial", exchange_id: "ex-004", note: "later", resolution: null });
    expect(cell(items, null, "guardrails")).toMatchObject({ status: "covered", supporting_exchange_ids: ["ex-003", "ex-004"], resolution: "answered" });
  });

  it("does not mutate its input and keeps unrelated cells", () => {
    const before = applyCoverage([], { event_id: "evt-001", dimension: "cues", status: "partial", exchange_id: "ex-001", note: null, resolution: null });
    const frozen = JSON.stringify(before);
    const after = applyCoverage(before, { event_id: "evt-002", dimension: "cues", status: "covered", exchange_id: "ex-002", note: null, resolution: null });
    expect(JSON.stringify(before)).toBe(frozen);
    expect(after).toHaveLength(2);
  });
});

describe("coverageGrid", () => {
  it("has one row per askable topic plus the session row, missing by default", () => {
    const topics = [topic("top-001", "evt-001"), topic("top-002", "evt-005", { state: "dropped_off_record", record_state: "off_record" })];
    const grid = coverageGrid(snap({ topics }));
    expect(grid).toHaveLength(12);
    expect(new Set(grid.map(c => c.event_id))).toEqual(new Set(["evt-001", null]));
    expect(grid.every(c => c.status === "missing")).toBe(true);
  });
});

describe("openQuestionsFromTopics", () => {
  it("turns deferred topics into open questions once", () => {
    const topics = [topic("top-001", "evt-001"), topic("top-002", "evt-002", { state: "deferred_to_debrief", deferred_reason: "moved_on", alias_event_ids: ["evt-006"] })];
    const qs = openQuestionsFromTopics(topics, []);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ open_question_id: "oq-001", related_event_ids: ["evt-002", "evt-006"], answered_by_exchange_id: null });
    expect(qs[0].missing_fact).toMatch(/SYS2/);
    expect(openQuestionsFromTopics(topics, qs)).toEqual(qs);
  });
});

describe("selectGaps", () => {
  const topics = [topic("top-001", "evt-001"), topic("top-002", "evt-004")];

  it("excludes covered items", () => {
    const coverage = applyCoverage([], { event_id: "evt-001", dimension: "guardrails", status: "covered", exchange_id: "ex-001", note: null, resolution: "answered" });
    const ids = selectGaps(snap({ topics, coverage, exchanges: [exchange("ex-001", "evt-001", "explain")] })).map(g => g.gap_id);
    expect(ids).not.toContain("gap-evt-001-guardrails");
    expect(ids).toContain("gap-evt-004-guardrails");
  });

  it("excludes a dimension already asked and answered on that region (same kind never twice)", () => {
    const exchanges = [exchange("ex-001", "evt-001", "explain"), exchange("ex-002", "evt-001", "guardrail")];
    const ids = selectGaps(snap({ topics, exchanges })).map(g => g.gap_id);
    expect(ids).not.toContain("gap-evt-001-guardrails");
    expect(ids).not.toContain("gap-evt-001-decision");
    // an unanswered question does not count
    const open = selectGaps(snap({ topics, exchanges: [exchange("ex-003", "evt-004", "guardrail", false)] })).map(g => g.gap_id);
    expect(open).toContain("gap-evt-004-guardrails");
  });

  it("never includes clarify_reference answers as coverage of anything", () => {
    const ids = selectGaps(snap({ topics, exchanges: [exchange("ex-001", "evt-004", "clarify_reference")] })).map(g => g.gap_id);
    expect(ids).toEqual(expect.arrayContaining(["gap-evt-004-decision", "gap-evt-004-guardrails"]));
  });

  it("deferred topics become open-question gaps, ranked first, with no per-dimension gaps", () => {
    const withDeferred = [...topics, topic("top-003", "evt-002", { state: "deferred_to_debrief", deferred_reason: "budget" })];
    const open_questions = openQuestionsFromTopics(withDeferred, []);
    const gaps = selectGaps(snap({ topics: withDeferred, open_questions }));
    expect(gaps[0]).toMatchObject({ gap_id: "gap-oq-001", event_id: "evt-002", topic_id: "top-003", open_question_id: "oq-001", status_at_start: "missing" });
    expect(gaps.some(g => g.gap_id.startsWith("gap-evt-002-"))).toBe(false);
    // answered open questions are no longer gaps
    const answered = open_questions.map(q => ({ ...q, answered_by_exchange_id: "ex-009" }));
    expect(selectGaps(snap({ topics: withDeferred, open_questions: answered })).some(g => g.open_question_id)).toBe(false);
  });

  it("prioritizes guardrails and alternatives, then missing reasons, before other dimensions", () => {
    const gaps = selectGaps(snap({ topics }));
    const dims = gaps.map(g => g.dimension);
    const firstOther = dims.findIndex(d => !["guardrails", "alternatives", "reason"].includes(d));
    expect(dims.slice(0, firstOther).sort()).toEqual(
      ["alternatives", "alternatives", "alternatives", "guardrails", "guardrails", "guardrails", "reason", "reason", "reason"].sort()
    );
    expect(gaps[0].gap_id).toBe("gap-evt-001-guardrails");
  });

  it("ranks missing before partial within a tier", () => {
    const coverage = applyCoverage([], { event_id: "evt-001", dimension: "guardrails", status: "partial", exchange_id: "ex-001", note: null, resolution: null });
    const gaps = selectGaps(snap({ topics, coverage, exchanges: [exchange("ex-001", "evt-001", "explain")] }));
    const partial = gaps.find(g => g.gap_id === "gap-evt-001-guardrails")!;
    expect(partial.status_at_start).toBe("partial");
    expect(gaps.indexOf(partial)).toBeGreaterThan(gaps.findIndex(g => g.gap_id === "gap-evt-004-guardrails"));
  });

  it("is deterministic and describes gaps without interpretation", () => {
    const a = selectGaps(snap({ topics }));
    expect(selectGaps(snap({ topics }))).toEqual(a);
    for (const g of a) expect(g.description).not.toMatch(/weld|joint|flat|crack|defect|damage/i);
    expect(a.find(g => g.gap_id === "gap-session-guardrails")!.description).toMatch(/task as a whole/);
  });
});

describe("debriefAgenda", () => {
  it("opens at most DEBRIEF_MAX_GAPS (3) items and keeps the rest as dropped, never asked (D6)", () => {
    const agenda = debriefAgenda(snap({ topics: [topic("top-001", "evt-001")] }));
    expect(DEBRIEF_MAX_GAPS).toBe(3);
    expect(agenda.filter(i => i.state === "open")).toHaveLength(DEBRIEF_MAX_GAPS);
    expect(agenda.slice(DEBRIEF_MAX_GAPS).every(i => i.state === "dropped")).toBe(true);
    expect(agenda.every(i => i.exchange_ids.length === 0)).toBe(true);
  });

  it("puts a guardrail gap first when no guardrail was asked live (D6)", () => {
    const s = snap({ topics: [topic("top-001", "evt-001")] });
    const plain = debriefAgenda(s, 3, false);
    const first = debriefAgenda(s, 3, true);
    expect(first[0].dimension).toBe("guardrails");
    expect(first.filter(i => i.state === "open")).toHaveLength(3);
    expect(new Set(first.map(i => i.gap_id))).toEqual(new Set(plain.map(i => i.gap_id)));
  });
});
