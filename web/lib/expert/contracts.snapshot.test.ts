import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ExpertExchange,
  SCHEMA_VERSION,
  type SessionSnapshot,
  type TimingMark,
  isValidSessionId,
  validateBeginQuestionParams,
  validateExpertExchange,
  validateSessionSnapshot,
  validateTimingMark,
} from "./contracts";

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
    started_at_utc: "2026-10-04T01:00:00.000Z",
    ended_at_utc: null,
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
  };
}

const errors = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }) => (r.ok ? [] : r.errors);

describe("validateBeginQuestionParams", () => {
  it("accepts a valid call", () => {
    const r = validateBeginQuestionParams({ event_id: "evt-001", kind: "explain", question: "What is going on here?" });
    expect(r).toEqual({ ok: true, value: { event_id: "evt-001", kind: "explain", question: "What is going on here?" } });
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
