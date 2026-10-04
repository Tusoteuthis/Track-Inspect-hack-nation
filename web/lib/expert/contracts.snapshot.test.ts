import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DraftRevision,
  type ExpertExchange,
  SCHEMA_VERSION,
  type SessionSnapshot,
  type TimingMark,
  type Topic,
  isValidSessionId,
  validateBeginQuestionParams,
  validateConfirmRevisionParams,
  validateProposeDraftParams,
  validateRecordCoverageParams,
  validateExpertExchange,
  validateSessionSnapshot,
  validateTimingMark,
  validateSessionCompletion,
  validateSetRecordStateParams,
} from "./contracts";
import { DEFAULT_INTERVIEW_CONFIG } from "./interview-config";

const evt001 = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "fixtures", "pointing-events", "evt-001-resolved.json"), "utf8")
);

function exchange(): ExpertExchange {
  return {
    exchange_id: "ex-001",
    session_id: "ses-20261004-010000-abcd",
    event_id: "evt-001",
    phase: "live",
    kind: "explain",
    question: "What do you recognize in this region?",
    question_planned: "What do you recognize here?",
    answer_lines: [{ text: "That's the usual pattern.", at_utc: "2026-10-04T01:00:10.000Z", transcript_line_id: "line-3" }],
    asked_at_utc: "2026-10-04T01:00:05.000Z",
    answer_started_at_utc: "2026-10-04T01:00:10.000Z",
    answer_ended_at_utc: "2026-10-04T01:00:10.000Z",
    audio_offset_secs: null,
    record_state: "on_record",
    source: "fixture",
    outcome: null,
    topic_id: "top-001",
    related_event_ids: [],
    gap_id: null,
    revision_id: null,
  };
}

function topic(): Topic {
  return {
    topic_id: "top-001",
    session_id: "ses-20261004-010000-abcd",
    primary_event_id: "evt-001",
    alias_event_ids: [],
    state: "answered",
    requires_clarification: false,
    record_state: "on_record",
    channel_id: "SYS1",
    queued_at_utc: "2026-10-04T01:00:01.000Z",
    queued_at_perf_ms: 1234.5,
    last_event_at_perf_ms: 1234.5,
    released_at_utc: "2026-10-04T01:00:04.000Z",
    released_at_perf_ms: 4000,
    asked_at_perf_ms: 4500,
    stale_at_release: false,
    release_text: "[POINTING_EVENT] event_id=evt-001 …",
    nudged_at_perf_ms: null,
    exchange_ids: ["ex-001"],
    deferred_reason: null,
  };
}

function mark(): TimingMark {
  return {
    session_id: "ses-20261004-010000-abcd",
    event_id: "evt-001",
    exchange_id: null,
    mark: "event_received",
    at_utc: "2026-10-04T01:00:01.000Z",
    at_perf_ms: 1234.5,
  };
}

function snapshot(): SessionSnapshot {
  return {
    schema_version: SCHEMA_VERSION,
    session_id: "ses-20261004-010000-abcd",
    conversation_id: null,
    conversation_ids: [],
    started_at_utc: "2026-10-04T01:00:00.000Z",
    ended_at_utc: null,
    end_cause: null,
    events: [{ ...evt001, session_id: "ses-20261004-010000-abcd" }],
    exchanges: [exchange()],
    active_exchange_id: "ex-001",
    awaiting_question_exchange_id: null,
    preamble: [],
    transcript: [
      { line_id: "line-1", role: "agent", text: "Hello.", at_utc: "2026-10-04T01:00:00.500Z", exchange_id: null },
    ],
    timing: [mark()],
    unlinked_agent_questions: [],
    topics: [topic()],
    interview_config: { ...DEFAULT_INTERVIEW_CONFIG },
    interaction_mode: "questions",
    phase: "live",
    phase_log: [],
    coverage: [],
    open_questions: [],
    debrief_agenda: [],
    revisions: [],
    confirmations: [],
    recording_segments: [
      { segment_id: "seg-001", state: "on_record", started_at_utc: "2026-10-04T01:00:00.000Z", ended_at_utc: null, trigger: "session_start" },
    ],
    off_record_excluded: { transcript_lines: 0, events: 0, timing_marks: 0, refused_tool_calls: 0 },
    strikes: [],
    elevenlabs_deletions: [],
  };
}

const errors = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }) => (r.ok ? [] : r.errors);

describe("validateBeginQuestionParams", () => {
  it("accepts a valid call", () => {
    const r = validateBeginQuestionParams({ event_id: "evt-001", kind: "explain", question: "What is going on here?" });
    expect(r).toEqual({
      ok: true,
      value: { event_id: "evt-001", kind: "explain", question: "What is going on here?", phase: null, gap_id: null },
    });
  });

  it('maps event_id "none" (and null) to null', () => {
    for (const event_id of ["none", "NONE", null]) {
      const r = validateBeginQuestionParams({ event_id, kind: "gap", question: "Anything else?" });
      expect(r.ok && r.value.event_id).toBeNull();
    }
  });

  it("rejects unknown kinds, missing question and non-objects", () => {
    expect(errors(validateBeginQuestionParams({ event_id: "evt-001", kind: "why", question: "Why?" }))).toEqual([
      expect.stringContaining("kind"),
    ]);
    expect(errors(validateBeginQuestionParams({ event_id: "evt-001", kind: "explain", question: " " }))).toEqual([
      expect.stringContaining("question"),
    ]);
    expect(validateBeginQuestionParams("evt-001").ok).toBe(false);
  });

  it("rejects an empty event_id", () => {
    expect(errors(validateBeginQuestionParams({ event_id: "", kind: "explain", question: "Q?" }))).toEqual([
      expect.stringContaining("event_id"),
    ]);
  });
});

describe("validateExpertExchange / validateTimingMark", () => {
  it("accepts valid records", () => {
    expect(errors(validateExpertExchange(exchange()))).toEqual([]);
    expect(errors(validateTimingMark(mark()))).toEqual([]);
  });

  it("allows an empty question while it is still pending", () => {
    expect(errors(validateExpertExchange({ ...exchange(), question: "", question_planned: null }))).toEqual([]);
  });

  it("rejects malformed answer lines and bad enums", () => {
    const bad = { ...exchange(), kind: "chat", answer_lines: [{ text: 3 }] };
    const errs = errors(validateExpertExchange(bad));
    expect(errs.some(e => e.includes("kind"))).toBe(true);
    expect(errs.some(e => e.includes("answer_lines[0]"))).toBe(true);
  });

  it("rejects an unknown timing mark name and a non-numeric perf time", () => {
    const errs = errors(validateTimingMark({ ...mark(), mark: "lunch", at_perf_ms: "1" }));
    expect(errs).toHaveLength(2);
  });
});

describe("isValidSessionId", () => {
  it.each(["ses-20261004-010000-abcd", "a", "x".repeat(64)])("accepts %s", id => {
    expect(isValidSessionId(id)).toBe(true);
  });

  it.each(["", "../etc", "ses/1", "SES-1", "ses_1", "x".repeat(65), "ses-1\n", "..", "."])("rejects %j", id => {
    expect(isValidSessionId(id)).toBe(false);
  });
});

describe("validateSessionSnapshot", () => {
  it("accepts a valid snapshot", () => {
    expect(errors(validateSessionSnapshot(snapshot()))).toEqual([]);
  });

  it("rejects an unsafe session id", () => {
    const errs = errors(validateSessionSnapshot({ ...snapshot(), session_id: "../../x" }));
    expect(errs[0]).toBe("session_id must match ^[a-z0-9-]{1,64}$");
  });

  it("reports nested record errors with their index", () => {
    const s = snapshot();
    const errs = errors(
      validateSessionSnapshot({ ...s, events: [{ ...s.events[0], region: null }], timing: [{ ...mark(), mark: "x" }] })
    );
    expect(errs.some(e => e.startsWith("events[0]"))).toBe(true);
    expect(errs.some(e => e.startsWith("timing[0]"))).toBe(true);
  });

  it("rejects records that belong to a different session", () => {
    const s = snapshot();
    const errs = errors(validateSessionSnapshot({ ...s, exchanges: [{ ...exchange(), session_id: "ses-other" }] }));
    expect(errs).toEqual([expect.stringContaining("exchanges[0].session_id")]);
  });

  it("rejects exchanges linked to unknown events and duplicate ids", () => {
    const s = snapshot();
    const errs = errors(
      validateSessionSnapshot({ ...s, exchanges: [{ ...exchange(), event_id: "evt-404" }, exchange()] })
    );
    expect(errs.some(e => e.includes("evt-404"))).toBe(true);
    expect(errs.some(e => e.includes("duplicate exchange_id"))).toBe(true);
  });

  it("rejects an active exchange id that does not exist", () => {
    expect(errors(validateSessionSnapshot({ ...snapshot(), active_exchange_id: "ex-999" }))).toEqual([
      expect.stringContaining("active_exchange_id"),
    ]);
  });

  it("rejects bad transcript entries", () => {
    const errs = errors(
      validateSessionSnapshot({ ...snapshot(), transcript: [{ line_id: "l", role: "robot", text: "", at_utc: "x" }] })
    );
    expect(errs.some(e => e.startsWith("transcript[0]"))).toBe(true);
  });
});

describe("Sprint 2 contract additions", () => {
  it("accepts a snapshot with topics, config and exchange topic links", () => {
    expect(errors(validateSessionSnapshot(snapshot()))).toEqual([]);
  });

  it("accepts the new timing marks", () => {
    for (const name of ["user_speech_started", "user_speech_ended", "topic_nudged"] as const) {
      expect(validateTimingMark({ ...mark(), mark: name }).ok).toBe(true);
    }
  });

  it("rejects a topic with an unknown state or unknown events", () => {
    const s = snapshot();
    s.topics = [{ ...topic(), state: "waiting" as Topic["state"] }];
    expect(errors(validateSessionSnapshot(s)).join(" | ")).toMatch(/topics\[0\]\.state/);
    const t = snapshot();
    t.topics = [{ ...topic(), alias_event_ids: ["evt-404"] }];
    expect(errors(validateSessionSnapshot(t)).join(" | ")).toMatch(/alias_event_ids evt-404/);
  });

  it("rejects a topic whose primary event is unknown", () => {
    const s = snapshot();
    s.topics = [{ ...topic(), primary_event_id: "evt-404" }];
    expect(errors(validateSessionSnapshot(s)).join(" | ")).toMatch(/primary_event_id evt-404/);
  });

  it("rejects exchanges with unknown related events or an unknown topic", () => {
    const s = snapshot();
    s.exchanges = [{ ...exchange(), related_event_ids: ["evt-404"], topic_id: "top-009" }];
    const e = errors(validateSessionSnapshot(s)).join(" | ");
    expect(e).toMatch(/related_event_ids.*evt-404/);
    expect(e).toMatch(/topic_id top-009/);
  });

  it("requires related_event_ids to be an array", () => {
    const x = { ...exchange(), related_event_ids: "evt-003" };
    expect(errors(validateExpertExchange(x)).join(" ")).toMatch(/related_event_ids/);
  });

  it("rejects a missing or invalid interview config", () => {
    const s = snapshot() as unknown as Record<string, unknown>;
    delete s.interview_config;
    expect(errors(validateSessionSnapshot(s)).join(" ")).toMatch(/interview_config/);
    const bad = snapshot();
    bad.interview_config = { ...DEFAULT_INTERVIEW_CONFIG, pause_ms: -1 };
    expect(errors(validateSessionSnapshot(bad)).join(" ")).toMatch(/interview_config\.pause_ms/);
  });
});

describe("Sprint 3 tool params", () => {
  it("begin_question takes phase and gap_id; 'none' gap = null", () => {
    const r = validateBeginQuestionParams({ event_id: "none", kind: "gap", question: "Q?", phase: "debrief", gap_id: "gap-evt-001-reason" });
    expect(r.ok && [r.value.phase, r.value.gap_id]).toEqual(["debrief", "gap-evt-001-reason"]);
    const n = validateBeginQuestionParams({ event_id: "evt-001", kind: "explain", question: "Q?", gap_id: "none" });
    expect(n.ok && n.value.gap_id).toBeNull();
    expect(errors(validateBeginQuestionParams({ event_id: "evt-001", kind: "explain", question: "Q?", phase: "done" }))).toEqual([
      expect.stringContaining("phase"),
    ]);
  });

  it("record_coverage validates dimensions and statuses, accepts a JSON-string array", () => {
    const ok = validateRecordCoverageParams({
      exchange_id: "ex-001",
      dimensions: JSON.stringify([{ dimension: "reason", status: "covered", note: " width " }]),
    });
    expect(ok).toEqual({ ok: true, value: { exchange_id: "ex-001", dimensions: [{ dimension: "reason", status: "covered", note: "width" }] } });
    const bad = errors(validateRecordCoverageParams({ exchange_id: "", dimensions: [{ dimension: "mood", status: "missing" }] }));
    expect(bad.join(" ")).toMatch(/exchange_id.*dimension.*status/s);
    expect(validateRecordCoverageParams({ exchange_id: "ex-1", dimensions: [] }).ok).toBe(false);
  });

  it("propose_draft validates steps", () => {
    const ok = validateProposeDraftParams({ steps: [{ kind: "guardrail", text: "Stop.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] }] });
    expect(ok.ok && ok.value.change_reason).toBeNull();
    expect(errors(validateProposeDraftParams({ steps: [{ kind: "rule", text: "", event_ids: "x" }] })).length).toBe(3);
  });

  it("confirm_revision validates status and step ids", () => {
    const ok = validateConfirmRevisionParams({ revision_id: "rev-1", status: "corrected", step_ids_reviewed: [] });
    expect(ok.ok && ok.value.step_ids_reviewed).toBeNull();
    expect(errors(validateConfirmRevisionParams({ revision_id: "rev-1", status: "yes" }))).toEqual([expect.stringContaining("status")]);
  });
});

describe("Sprint 3 snapshot records", () => {
  const rev = (id: string, parent: string | null): DraftRevision => ({
    revision_id: id,
    session_id: "ses-20261004-010000-abcd",
    created_at_utc: "2026-10-04T01:10:00.000Z",
    parent_revision_id: parent,
    steps: [{ step_id: "s-1", text: "First check the spike.", kind: "step", supporting_event_ids: ["evt-001"], supporting_exchange_ids: ["ex-001"], supported: true }],
    change_reason: null,
    change_exchange_ids: [],
  });

  it("accepts coverage, agenda, revisions and confirmations that link to known records", () => {
    const s = snapshot();
    s.phase = "confirmed";
    s.phase_log = [{ phase: "debrief", at_utc: "2026-10-04T01:05:00.000Z", trigger: "agent_tool" }];
    s.coverage = [{ dimension: "reason", event_id: "evt-001", status: "covered", supporting_exchange_ids: ["ex-001"], note: "AI", resolution: "answered" }];
    s.debrief_agenda = [
      { gap_id: "gap-evt-001-guardrails", event_id: "evt-001", topic_id: "top-001", dimension: "guardrails", open_question_id: null, description: "d", status_at_start: "missing", state: "asked", exchange_ids: ["ex-001"] },
    ];
    s.revisions = [rev("rev-1", null), rev("rev-2", "rev-1")];
    s.confirmations = [{ confirmation_id: "conf-001", revision_id: "rev-2", status: "confirmed", step_ids_reviewed: ["s-1"], expert_response_exchange_id: "ex-001", at_utc: "2026-10-04T01:11:00.000Z" }];
    expect(errors(validateSessionSnapshot(s))).toEqual([]);
  });

  it("rejects broken links", () => {
    const s = snapshot();
    s.phase = "finished" as never;
    s.coverage = [{ dimension: "reason", event_id: "evt-404", status: "covered", supporting_exchange_ids: ["ex-404"], note: null, resolution: null }];
    s.revisions = [rev("rev-2", "rev-1")];
    s.confirmations = [{ confirmation_id: "c", revision_id: "rev-9", status: "confirmed", step_ids_reviewed: [], expert_response_exchange_id: "ex-404", at_utc: "2026-10-04T01:11:00.000Z" }];
    s.exchanges = [{ ...exchange(), gap_id: "gap-x", revision_id: "rev-7" }];
    const e = errors(validateSessionSnapshot(s)).join(" | ");
    for (const re of [/phase must/, /evt-404/, /ex-404/, /parent_revision_id/, /rev-9/, /gap-x/, /rev-7/]) expect(e).toMatch(re);
  });
});

describe("Sprint 4: off-record guard, strikes, completion", () => {
  const off = (from: string, to: string | null) => {
    const s = snapshot();
    s.recording_segments = [
      { segment_id: "seg-001", state: "on_record", started_at_utc: "2026-10-04T01:00:00.000Z", ended_at_utc: from, trigger: "session_start" },
      { segment_id: "seg-002", state: "off_record", started_at_utc: from, ended_at_utc: to, trigger: "agent_tool" },
      ...(to ? [{ segment_id: "seg-003", state: "on_record" as const, started_at_utc: to, ended_at_utc: null, trigger: "agent_tool" as const }] : []),
    ];
    return s;
  };

  it("accepts a snapshot whose content lies outside the off-record segment", () => {
    expect(errors(validateSessionSnapshot(off("2026-10-04T01:00:20.000Z", "2026-10-04T01:00:30.000Z")))).toEqual([]);
  });

  it("refuses any line, answer line or timing mark inside an off-record segment (open or closed)", () => {
    const closed = errors(validateSessionSnapshot(off("2026-10-04T01:00:00.400Z", "2026-10-04T01:00:15.000Z"))).join(" | ");
    for (const re of [/transcript\[0\]/, /answer_lines\[0\]/, /timing\[0\]/]) expect(closed).toMatch(re);
    expect(errors(validateSessionSnapshot(off("2026-10-04T01:00:09.000Z", null))).join(" | ")).toMatch(/answer_lines\[0\]/);
  });

  it("refuses off-record events and exchanges outright", () => {
    const s = snapshot();
    s.events = [{ ...s.events[0], record_state: "off_record" }];
    s.exchanges = [{ ...exchange(), record_state: "off_record" }];
    const e = errors(validateSessionSnapshot(s)).join(" | ");
    expect(e).toMatch(/events\[0\] is off the record/);
    expect(e).toMatch(/exchanges\[0\] is off the record/);
  });

  it("requires alternating, closed segments and a struck exchange without words", () => {
    const s = snapshot();
    s.recording_segments = [
      { segment_id: "seg-001", state: "on_record", started_at_utc: "2026-10-04T01:00:00.000Z", ended_at_utc: null, trigger: "session_start" },
      { segment_id: "seg-002", state: "on_record", started_at_utc: "2026-10-04T01:00:01.000Z", ended_at_utc: null, trigger: "console" },
    ];
    s.strikes = [{ strike_id: "str-001", exchange_id: "ex-001", at_utc: "2026-10-04T01:00:12.000Z", trigger: "agent_tool", removed_line_count: 1, superseded_revision_ids: ["rev-9"], invalidated_confirmation_ids: [] }];
    const e = errors(validateSessionSnapshot(s)).join(" | ");
    for (const re of [/must be closed/, /must change the state/, /still has answer lines/, /rev-9/]) expect(e).toMatch(re);
  });

  it("validates set_record_state params, accepting on/off shorthands", () => {
    expect(validateSetRecordStateParams({ state: "off" })).toEqual({ ok: true, value: { state: "off_record" } });
    expect(validateSetRecordStateParams({ state: "on_record" })).toEqual({ ok: true, value: { state: "on_record" } });
    expect(validateSetRecordStateParams({ state: "maybe" }).ok).toBe(false);
  });

  it("a completion can never be completed without a confirmed revision", () => {
    const base = {
      schema_version: SCHEMA_VERSION,
      session_id: "ses-20261004-010000-abcd",
      ended_at_utc: "2026-10-04T01:20:00.000Z",
      end_reason: "completed",
      final_phase: "teach_back",
      confirmed_revision_id: null,
      unfinished: [],
    };
    expect(errors(validateSessionCompletion(base)).join(" | ")).toMatch(/completed session needs a confirmed revision/);
    expect(errors(validateSessionCompletion({ ...base, end_reason: "incomplete" })).join(" | ")).toMatch(/must say what was not finished/);
    expect(errors(validateSessionCompletion({ ...base, end_reason: "incomplete", unfinished: ["teach-back not confirmed"], confirmed_revision_id: "rev-1" })).join(" | ")).toMatch(/must be null/);
  });
});
