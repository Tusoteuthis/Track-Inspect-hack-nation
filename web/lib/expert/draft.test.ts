import { describe, expect, it } from "vitest";
import type { CoverageItem, DraftRevision, ExpertConfirmation, ExpertExchange, PointingEvent, Topic } from "./contracts";
import {
  type DraftContext,
  addRevision,
  buildRevision,
  checkQuotes,
  diffRevisions,
  fallbackProposal,
  quotedSpans,
  stepVerification,
  stepsToTeach,
} from "./draft";
import { FIXTURE_EVENTS } from "./fixtures";
import { injectFixture } from "./session";

const SID = "ses-20261004-040000-drf1";
const AT = "2026-10-04T04:10:00.000Z";
const events: PointingEvent[] = FIXTURE_EVENTS.map(e => injectFixture(e, SID));

function ex(id: string, event: string | null, kind: ExpertExchange["kind"], lines: string[]): ExpertExchange {
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
    answer_lines: lines.map((text, i) => ({ text, at_utc: AT, transcript_line_id: `${id}-u${i}` })),
    gap_id: null,
    revision_id: null,
    asked_at_utc: AT,
    answer_started_at_utc: null,
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    record_state: "on_record",
    source: "fixture",
  };
}

const exchanges = [
  ex("ex-001", "evt-001", "explain", ["That spike is usually from the wheel set passing a gap.", "Twice the amplitude, very narrow."]),
  ex("ex-002", "evt-001", "guardrail", ["If both channels show it at the same moment I stop and call the measurement team."]),
  ex("ex-003", "evt-004", "clarify_reference", ["I mean both channels together."]),
  ex("ex-004", null, "gap", ["I always compare with the previous run first."]),
];

const topics: Topic[] = [
  {
    topic_id: "top-001",
    session_id: SID,
    primary_event_id: "evt-001",
    alias_event_ids: [],
    state: "answered",
    requires_clarification: false,
    record_state: "on_record",
    channel_id: "SYS1",
    queued_at_utc: AT,
    queued_at_perf_ms: 0,
    last_event_at_perf_ms: 0,
    released_at_utc: null,
    released_at_perf_ms: null,
    asked_at_perf_ms: null,
    stale_at_release: null,
    release_text: null,
    nudged_at_perf_ms: null,
    exchange_ids: ["ex-001", "ex-002"],
    deferred_reason: null,
  },
];

const ctx = (over: Partial<DraftContext> = {}): DraftContext => ({
  session_id: SID,
  events,
  exchanges,
  topics,
  coverage: [],
  revisions: [],
  ...over,
});

const opts = { at_utc: AT, change_reason: null, change_exchange_ids: [] };

describe("quotedSpans / checkQuotes", () => {
  it("finds double, curly and single-quoted spans but not apostrophes", () => {
    expect(quotedSpans(`He said "twice the amplitude" and “very narrow”, it's 'usually' fine, don't worry`)).toEqual([
      "twice the amplitude",
      "very narrow",
      "usually",
    ]);
  });

  it("accepts verbatim quotes (case, spacing and trailing punctuation aside) and rejects invented ones", () => {
    const lines = ["That spike is usually from the wheel set passing a gap."];
    expect(checkQuotes(`First look for the spike: "That spike is usually from the wheel set passing a gap."`, lines)).toEqual([]);
    expect(checkQuotes(`"that  spike is USUALLY from the wheel set",`, lines)).toEqual([]);
    expect(checkQuotes(`The expert said "it is always a wheel flat"`, lines)).toEqual(["it is always a wheel flat"]);
    // a qualified statement must not become an absolute rule inside a quote
    expect(checkQuotes(`"That spike is from the wheel set passing a gap"`, lines)).toEqual(["That spike is from the wheel set passing a gap"]);
  });
});

describe("buildRevision", () => {
  it("assigns rev-1 and step ids, links exchange events, and keeps quotes verbatim", () => {
    const r = buildRevision(
      ctx(),
      {
        steps: [
          { kind: "step", text: `First look for a narrow spike on SYS1 ("twice the amplitude").`, event_ids: [], exchange_ids: ["ex-001"] },
          { kind: "guardrail", text: "If both channels show it at the same moment, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
        ],
        change_reason: null,
      },
      { ...opts, parent: null }
    );
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.revision).toMatchObject({ revision_id: "rev-1", parent_revision_id: null, session_id: SID, created_at_utc: AT });
    expect(r.revision.steps.map(s => [s.step_id, s.supported, s.supporting_event_ids])).toEqual([
      ["s-1", true, ["evt-001"]],
      ["s-2", true, ["evt-001"]],
    ]);
  });

  it("flags a step without event or exchange evidence as unsupported (never as fact)", () => {
    const r = buildRevision(
      ctx(),
      {
        steps: [
          { kind: "step", text: "Compare with the previous run.", event_ids: [], exchange_ids: ["ex-004"] },
          { kind: "decision", text: "Decide quickly.", event_ids: ["evt-001"], exchange_ids: [] },
          { kind: "step", text: "Region only.", event_ids: [], exchange_ids: ["ex-003"] },
        ],
        change_reason: null,
      },
      { ...opts, parent: null }
    );
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.revision.steps.map(s => s.supported)).toEqual([false, false, false]);
    expect(r.unsupported).toHaveLength(3);
  });

  it("rejects unknown evidence ids and non-verbatim quotes, listing every error", () => {
    const r = buildRevision(
      ctx(),
      {
        steps: [
          { kind: "step", text: `He said "it is a wheel flat".`, event_ids: ["evt-404"], exchange_ids: ["ex-001", "ex-404"] },
        ],
        change_reason: null,
      },
      { ...opts, parent: null }
    );
    expect(r.ok).toBe(false);
    const e = r.ok ? "" : r.errors.join(" | ");
    expect(e).toMatch(/evt-404/);
    expect(e).toMatch(/ex-404/);
    expect(e).toMatch(/not verbatim.*wheel flat/);
  });

  it("adds a guardrail step for anything the expert said is unknown / to escalate", () => {
    const coverage: CoverageItem[] = [
      { dimension: "alternatives", event_id: "evt-001", status: "covered", supporting_exchange_ids: ["ex-002"], note: null, resolution: "unknown_escalate" },
    ];
    const r = buildRevision(
      ctx({ coverage }),
      { steps: [{ kind: "step", text: "Look for the spike.", event_ids: [], exchange_ids: ["ex-001"] }], change_reason: null },
      { ...opts, parent: null }
    );
    if (!r.ok) throw new Error(r.errors.join("; "));
    const added = r.revision.steps.at(-1)!;
    expect(added).toMatchObject({ kind: "guardrail", supported: true, supporting_exchange_ids: ["ex-002"], supporting_event_ids: ["evt-001"] });
    expect(added.text).toMatch(/escalate/i);
    expect(checkQuotes(added.text, exchanges[1].answer_lines.map(l => l.text))).toEqual([]);
  });

  it("keeps step ids of unchanged steps across revisions and gives changed steps new ids", () => {
    const first = buildRevision(
      ctx(),
      {
        steps: [
          { kind: "step", text: "Look for the spike.", event_ids: [], exchange_ids: ["ex-001"] },
          { kind: "guardrail", text: "Stop if it shows on one channel.", event_ids: [], exchange_ids: ["ex-002"] },
        ],
        change_reason: null,
      },
      { ...opts, parent: null }
    );
    if (!first.ok) throw new Error();
    const second = buildRevision(
      ctx({ revisions: [first.revision] }),
      {
        steps: [
          { kind: "step", text: "Look for the spike.", event_ids: [], exchange_ids: ["ex-001"] },
          { kind: "guardrail", text: "Stop only if it shows on both channels at the same moment.", event_ids: [], exchange_ids: ["ex-002"] },
        ],
        change_reason: "only when both channels",
      },
      { at_utc: AT, parent: first.revision, change_reason: "Correction in ex-002: only when both channels", change_exchange_ids: ["ex-002"] }
    );
    if (!second.ok) throw new Error(second.errors.join());
    expect(second.revision).toMatchObject({ revision_id: "rev-2", parent_revision_id: "rev-1", change_exchange_ids: ["ex-002"] });
    expect(second.revision.change_reason).toMatch(/ex-002/);
    expect(second.revision.steps.map(s => s.step_id)).toEqual(["s-1", "s-3"]);
    expect(diffRevisions(first.revision, second.revision)).toEqual({ added: ["s-3"], removed: ["s-2"], unchanged: ["s-1"] });
    expect(stepsToTeach(second.revision, first.revision).map(s => s.step_id)).toEqual(["s-3"]);
    expect(stepsToTeach(first.revision, null).map(s => s.step_id)).toEqual(["s-1", "s-2"]);
  });
});

describe("addRevision (immutable)", () => {
  it("appends and refuses to replace an existing revision id", () => {
    const rev: DraftRevision = {
      revision_id: "rev-1",
      session_id: SID,
      created_at_utc: AT,
      parent_revision_id: null,
      steps: [],
      change_reason: null,
      change_exchange_ids: [],
    };
    const list = addRevision([], rev);
    expect(list).toEqual([rev]);
    expect(() => addRevision(list, { ...rev, change_reason: "edited" })).toThrow(/immutable/);
    expect(Object.isFrozen(list[0])).toBe(true);
  });
});

describe("fallbackProposal", () => {
  it("builds steps from verbatim answer lines with evidence, skipping clarify answers", () => {
    const p = fallbackProposal(ctx());
    const r = buildRevision(ctx(), p, { ...opts, parent: null });
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.revision.steps.length).toBeGreaterThanOrEqual(2);
    expect(r.revision.steps.find(s => s.kind === "guardrail")!.supporting_exchange_ids).toEqual(["ex-002"]);
    expect(r.revision.steps.some(s => s.supporting_exchange_ids.includes("ex-003"))).toBe(false);
  });
});

describe("stepVerification", () => {
  const rev = (id: string, parent: string | null, stepIds: string[]): DraftRevision => ({
    revision_id: id,
    session_id: SID,
    created_at_utc: AT,
    parent_revision_id: parent,
    steps: stepIds.map(step_id => ({ step_id, text: step_id, kind: "step", supporting_event_ids: ["evt-001"], supporting_exchange_ids: ["ex-001"], supported: true })),
    change_reason: null,
    change_exchange_ids: [],
  });
  const conf = (revision_id: string, status: ExpertConfirmation["status"], step_ids_reviewed: string[]): ExpertConfirmation => ({
    confirmation_id: `c-${revision_id}-${status}`,
    revision_id,
    status,
    step_ids_reviewed,
    expert_response_exchange_id: "ex-009",
    at_utc: AT,
  });

  it("confirms only steps of the latest revision that some confirmation in its chain reviewed", () => {
    const revisions = [rev("rev-1", null, ["s-1", "s-2"]), rev("rev-2", "rev-1", ["s-1", "s-3", "s-4"])];
    const confirmations = [conf("rev-1", "corrected", ["s-1", "s-2"]), conf("rev-2", "confirmed", ["s-3"])];
    expect(stepVerification(revisions, confirmations)).toEqual({ "s-1": "confirmed", "s-3": "confirmed", "s-4": "unresolved" });
  });

  it("leaves everything unresolved without a confirmed confirmation of the latest revision", () => {
    const revisions = [rev("rev-1", null, ["s-1"]), rev("rev-2", "rev-1", ["s-1"])];
    expect(stepVerification(revisions, [conf("rev-1", "confirmed", ["s-1"])])).toEqual({ "s-1": "unresolved" });
    expect(stepVerification(revisions, [])).toEqual({ "s-1": "unresolved" });
  });
});
