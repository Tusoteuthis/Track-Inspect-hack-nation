import { describe, expect, it } from "vitest";
import { validateSessionCompletion } from "./contracts";
import { deriveCompletion, renderCompletionMd } from "./completion";
import { resumeSummary } from "./resume";
import { toSnapshot } from "./session";
import { liveCounters } from "./timing";
import { confirmedSession, driver } from "./test-driver";

const end = (d: ReturnType<typeof driver>, cause: "stop" | "disconnect" | "error" = "stop") => {
  d.act({ type: "session_ended", cause });
  return toSnapshot(d.state);
};

function liveOnly() {
  const d = driver("ses-20261004-110000-cmp1");
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert("That spike is usually from the wheel set passing a gap.");
  return d;
}

describe("deriveCompletion", () => {
  it("a confirmed session is completed and names the confirmed revision", () => {
    const c = deriveCompletion(end(confirmedSession("ses-20261004-110000-cmp0")));
    expect(c).toMatchObject({ end_reason: "completed", confirmed_revision_id: "rev-1", final_phase: "confirmed", end_cause: "stop" });
    expect(validateSessionCompletion(c).ok).toBe(true);
    expect(renderCompletionMd(c)).toMatch(/COMPLETED/);
  });

  it("an incomplete session is never marked confirmed, whatever phase it ended in", () => {
    const cases: [string, () => ReturnType<typeof driver>][] = [
      ["live", liveOnly],
      [
        "debrief",
        () => {
          const d = liveOnly();
          d.act({ type: "task_completed", trigger: "console" });
          return d;
        },
      ],
      [
        "teach-back, unanswered",
        () => {
          const d = liveOnly();
          d.act({ type: "task_completed", trigger: "console" });
          d.act({ type: "draft_proposed", trigger: "console", params: null });
          return d;
        },
      ],
      [
        "teach-back, corrected only",
        () => {
          const d = liveOnly();
          d.act({ type: "task_completed", trigger: "console" });
          d.act({ type: "draft_proposed", trigger: "console", params: null });
          d.agent("First look for the spike. Is that right?");
          d.expert("No, only on SYS1.");
          d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "corrected" } });
          return d;
        },
      ],
      [
        "confirmed, then the confirmation was struck",
        () => {
          const d = confirmedSession("ses-20261004-110000-cmp2");
          d.act({ type: "strike_requested", trigger: "console" });
          return d;
        },
      ],
    ];
    for (const [name, build] of cases) {
      const c = deriveCompletion(end(build()));
      expect({ name, reason: c.end_reason, rev: c.confirmed_revision_id }).toEqual({ name, reason: "incomplete", rev: null });
      expect(c.unfinished.length, name).toBeGreaterThan(0);
      expect(validateSessionCompletion(c).ok, name).toBe(true);
      const md = renderCompletionMd(c);
      expect(md, name).toMatch(/INCOMPLETE/);
      expect(md, name).not.toMatch(/COMPLETED|fully understood/i);
    }
  });

  it("says plainly what was not finished", () => {
    const d = liveOnly();
    d.act({ type: "task_completed", trigger: "console" });
    d.act({ type: "draft_proposed", trigger: "console", params: null });
    const c = deriveCompletion(end(d));
    expect(c.unfinished.join(" | ")).toMatch(/teach-back not confirmed \(rev-1\)/);
    expect(c.unfinished.join(" | ")).toMatch(/debrief gap\(s\) unresolved/);
    expect(c.open_gap_ids.length).toBeGreaterThan(0);
    expect(deriveCompletion(end(liveOnly())).unfinished.join(" | ")).toMatch(/debrief not started/);
  });

  it("an error ends the session as aborted", () => {
    expect(deriveCompletion(end(liveOnly(), "error")).end_reason).toBe("aborted");
  });

  it("question counts are derived from the stored records, not kept counters", () => {
    const snap = end(confirmedSession("ses-20261004-110000-cmp3"));
    const c = deriveCompletion(snap);
    const live = liveCounters(snap);
    expect(c.counts).toMatchObject({
      live_questions: live.live_questions,
      live_guardrail_questions: live.guardrail_questions,
      debrief_questions: live.debrief_questions,
      confirmations: 1,
    });
    expect(c.counts.live_questions).toBe(2);
    expect(c.counts.live_guardrail_questions).toBe(1);
    // drop the guardrail exchange from the records: the counts follow
    const fewer = deriveCompletion({ ...snap, exchanges: snap.exchanges.filter(x => x.kind !== "guardrail") });
    expect(fewer.counts).toMatchObject({ live_questions: 1, live_guardrail_questions: 0 });
  });

  it("reports excluded material as counts and neutral segment times only", () => {
    const d = liveOnly();
    d.act({ type: "record_state_changed", to: "off_record", trigger: "console" });
    d.expert("pineapple calibration");
    d.act({ type: "record_state_changed", to: "on_record", trigger: "console" });
    const c = deriveCompletion(end(d));
    expect(c.excluded.off_record_segments).toBe(1);
    expect(c.excluded.transcript_lines).toBe(1);
    expect(c.excluded.segments[0].to_utc).not.toBeNull();
    expect(JSON.stringify(c) + renderCompletionMd(c)).not.toMatch(/pineapple/);
  });

  it("refuses a session that has not ended", () => {
    expect(() => deriveCompletion(toSnapshot(liveOnly().state))).toThrow(/not ended/);
  });
});

describe("resume after a dropped connection", () => {
  it("reopens the same session in the phase it was in, with a new conversation id", () => {
    const d = liveOnly();
    d.act({ type: "connected", conversation_id: "conv_a" });
    d.act({ type: "task_completed", trigger: "console" });
    d.act({ type: "session_ended", cause: "disconnect" });
    expect(d.state.phase).toBe("incomplete");
    d.act({ type: "resumed" });
    d.act({ type: "connected", conversation_id: "conv_b" });
    expect(d.state).toMatchObject({ phase: "debrief", ended_at_utc: null, end_cause: null, conversation_ids: ["conv_a", "conv_b"], conversation_id: "conv_b" });
    expect(d.state.phase_log.at(-1)).toMatchObject({ phase: "debrief", trigger: "resume" });
  });

  it("a confirmed session cannot be resumed", () => {
    const d = confirmedSession("ses-20261004-110000-res1");
    d.act({ type: "session_ended", cause: "stop" });
    const before = d.state;
    d.act({ type: "resumed" });
    expect(d.state.ended_at_utc).toBe(before.ended_at_utc);
  });

  it("the resume summary describes state, never the expert's words", () => {
    const d = liveOnly();
    d.act({ type: "task_completed", trigger: "console" });
    const text = resumeSummary(d.state);
    expect(text).toMatch(/^\[RESUME\]/);
    expect(text).toMatch(/phase debrief/);
    expect(text).toMatch(/gap-/);
    expect(text).not.toMatch(/wheel set|spike is usually/);
  });
});
