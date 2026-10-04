import { describe, expect, it } from "vitest";
import { validateSessionSnapshot } from "./contracts";
import { toSnapshot } from "./session";
import { driver } from "./test-driver";
import { liveCounters } from "./timing";

const SID = "ses-20261004-050000-dbr1";

/** Live phase: evt-001 explained (+ guardrail answered), evt-002 never asked (deferred at task end). */
function liveSession() {
  const d = driver(SID);
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert("That spike is usually from the wheel set passing a gap.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "partial", note: "flags the spike" }] } });
  d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else?" });
  d.expert("If both channels show it at the same moment I stop and call the measurement team.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "both channels → call team" }] } });
  d.event("evt-002");
  return d;
}

describe("record_coverage", () => {
  it("rejects unknown, unanswered and clarify_reference exchanges", () => {
    const d = driver(SID);
    d.event("evt-004");
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: "ex-009", dimensions: [{ dimension: "reason", status: "covered" }] } })).toMatch(/^error unknown exchange_id/);
    d.ask({ event_id: "evt-004", kind: "clarify_reference", question: "Which part do you mean?" });
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "reason", status: "covered" }] } })).toMatch(/no answer/);
    d.expert("Both channels together.");
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "reason", status: "covered" }] } })).toMatch(/only identified a region/);
    expect(d.state.coverage).toEqual([]);
  });

  it("is monotonic through the tool and keeps the note apart from the verbatim answer", () => {
    const d = liveSession();
    expect(d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "partial", note: "later" }] } })).toMatch(/^ok/);
    const g = d.state.coverage.find(c => c.event_id === "evt-001" && c.dimension === "guardrails")!;
    expect(g.status).toBe("covered");
    expect(d.state.exchanges[1].answer_lines.map(l => l.text)).toEqual(["If both channels show it at the same moment I stop and call the measurement team."]);
  });
});

describe("phases and debrief", () => {
  it("live → debrief: defers leftover topics, makes open questions, freezes an agenda without covered items", () => {
    const d = liveSession();
    const r = d.act({ type: "task_completed", trigger: "agent_tool" })!;
    expect(r).toMatch(/^ok phase=debrief\. \[PHASE debrief\]/);
    const s = d.state;
    expect(s.phase).toBe("debrief");
    expect(s.phase_log).toEqual([expect.objectContaining({ phase: "debrief", trigger: "agent_tool" })]);
    expect(s.topics.find(t => t.primary_event_id === "evt-002")).toMatchObject({ state: "deferred_to_debrief", deferred_reason: "task_complete" });
    expect(s.open_questions).toHaveLength(1);
    const ids = s.debrief_agenda.map(i => i.gap_id);
    expect(ids[0]).toBe("gap-oq-001");
    expect(ids).not.toContain("gap-evt-001-guardrails");
    expect(ids).not.toContain("gap-evt-001-decision");
    expect(s.debrief_agenda.length).toBeGreaterThanOrEqual(3);
    expect(d.act({ type: "task_completed", trigger: "console" })).toMatch(/^error .*already/);
  });

  it("debrief questions need an open agenda gap and take their event from it", () => {
    const d = liveSession();
    d.act({ type: "task_completed", trigger: "console" });
    expect(d.ask({ event_id: "none", kind: "gap", question: "Anything else?" })).toMatch(/needs a gap_id/);
    expect(d.ask({ event_id: "none", kind: "gap", question: "Q?", gap_id: "gap-evt-001-guardrails" })).toMatch(/not on the agenda/);
    expect(d.ask({ event_id: "evt-001", kind: "gap", question: "Q?", phase: "live", gap_id: "gap-oq-001" })).toMatch(/current phase is debrief/);
    expect(d.ask({ event_id: "evt-001", kind: "reasoning", question: "What about the lower channel?", phase: "debrief", gap_id: "gap-oq-001" })).toMatch(/^ok/);
    const x = d.state.exchanges.at(-1)!;
    expect(x).toMatchObject({ phase: "debrief", kind: "gap", gap_id: "gap-oq-001", event_id: "evt-002", question: "What about the lower channel?" });
    expect(d.state.debrief_agenda[0].state).toBe("asked");
  });

  it("an answered gap is resolved and never asked again; an open question gets answered", () => {
    const d = liveSession();
    d.act({ type: "task_completed", trigger: "console" });
    d.ask({ event_id: "none", kind: "gap", question: "And the drift on the lower channel?", gap_id: "gap-oq-001" });
    d.expert("That drift is the sensor warming up, I ignore it in the first ten minutes.");
    expect(
      d.act({ type: "coverage_recorded", params: { exchange_id: d.lastExchangeId(), dimensions: [{ dimension: "decision", status: "covered", note: "ignore early drift" }] } })
    ).toMatch(/Open gaps: gap-/);
    expect(d.state.debrief_agenda[0].state).toBe("resolved");
    expect(d.state.open_questions[0].answered_by_exchange_id).toBe(d.lastExchangeId());
    expect(d.ask({ event_id: "none", kind: "gap", question: "Again?", gap_id: "gap-oq-001" })).toMatch(/already answered/);
  });

  it("'I don't know, I'd escalate' closes the gap as unknown and becomes a guardrail", () => {
    const d = liveSession();
    d.act({ type: "task_completed", trigger: "console" });
    const gap = d.state.debrief_agenda.find(i => i.gap_id === "gap-evt-001-alternatives")!;
    d.ask({ event_id: "none", kind: "gap", question: "What could look similar?", gap_id: gap.gap_id });
    d.expert("Honestly I don't know, I'd escalate that to the measurement team.");
    d.act({ type: "coverage_recorded", params: { exchange_id: d.lastExchangeId(), dimensions: [{ dimension: "alternatives", status: "unknown_escalate", note: "unknown" }] } });
    expect(d.state.debrief_agenda.find(i => i.gap_id === gap.gap_id)!.state).toBe("unknown");
    expect(d.state.coverage.find(c => c.event_id === "evt-001" && c.dimension === "alternatives")).toMatchObject({ status: "covered", resolution: "unknown_escalate" });
  });

  it("keeps live and debrief counters apart", () => {
    const d = liveSession();
    const live = liveCounters(d.state);
    d.act({ type: "task_completed", trigger: "console" });
    d.ask({ event_id: "none", kind: "gap", question: "And SYS2?", gap_id: "gap-oq-001" });
    d.expert("Warm-up drift.");
    const after = liveCounters(d.state);
    expect([after.live_questions, after.guardrail_questions]).toEqual([live.live_questions, live.guardrail_questions]);
    expect([live.debrief_questions, after.debrief_questions]).toEqual([0, 1]);
  });

  it("refuses an agent draft before 3 debrief answers; the console may force one", () => {
    const d = liveSession();
    d.act({ type: "task_completed", trigger: "console" });
    expect(d.act({ type: "draft_proposed", params: { steps: [{ kind: "step", text: "x", event_ids: [], exchange_ids: ["ex-001"] }] }, trigger: "agent_tool" })).toMatch(/at least 3/);
    expect(d.act({ type: "draft_proposed", params: null, trigger: "console" })).toMatch(/^ok revision_id=rev-1\. \[TEACH_BACK rev-1\]/);
    expect(d.state.phase).toBe("teach_back");
  });
});

/** Live + debrief + rev-1 via the console fallback, teach-back spoken. */
function teachBackSession() {
  const d = liveSession();
  d.act({ type: "task_completed", trigger: "console" });
  d.act({ type: "draft_proposed", params: null, trigger: "console" });
  d.agent("First look for the narrow spike on SYS1. If both channels show it at the same moment, stop and call the measurement team. Is that right?");
  return d;
}

describe("teach-back and confirmation", () => {
  it("opens a teach-back exchange that holds the spoken teach-back verbatim", () => {
    const d = teachBackSession();
    const x = d.state.exchanges.at(-1)!;
    expect(x).toMatchObject({ phase: "teach_back", kind: "teach_back", revision_id: "rev-1" });
    expect(x.question).toMatch(/^First look for the narrow spike.*Is that right\?$/);
  });

  it("silence is not confirmation: no expert words → nothing recorded", () => {
    const d = teachBackSession();
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } })).toMatch(/no explicit expert response.*silence/);
    expect(d.state.confirmations).toEqual([]);
    d.act({ type: "session_ended" });
    expect(d.state.phase).toBe("incomplete");
    expect(d.state.phase_log.at(-1)).toMatchObject({ phase: "incomplete", trigger: "session_end" });
  });

  it("links the confirmation to the exchange holding the expert's words", () => {
    const d = teachBackSession();
    d.expert("Yes, that's right.");
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } })).toMatch(/^ok confirmation_id=conf-001 status=confirmed/);
    const c = d.state.confirmations[0];
    expect(c.expert_response_exchange_id).toBe(d.state.exchanges.at(-1)!.exchange_id);
    expect(c.step_ids_reviewed).toEqual(d.state.revisions[0].steps.filter(s => s.supported).map(s => s.step_id));
    expect(d.state.phase).toBe("confirmed");
    d.act({ type: "session_ended" });
    expect(d.state.phase).toBe("confirmed");
  });

  it("correction → rev-2 with parent and change_reason; stale ids rejected; the same response is never reused", () => {
    const d = teachBackSession();
    d.expert("No, that's wrong, it's only when both channels show it.");
    const correction = d.state.exchanges.at(-1)!.exchange_id;
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "corrected" } })).toMatch(/status=corrected/);
    // without a new expert answer, a second confirmation is impossible
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } })).toMatch(/no explicit expert response/);
    const rev1 = d.state.revisions[0];
    const steps = rev1.steps.map(s => ({ kind: s.kind, text: s.text, event_ids: s.supporting_event_ids, exchange_ids: s.supporting_exchange_ids }));
    steps.push({ kind: "guardrail", text: "Stop only when both channels show it.", event_ids: ["evt-001"], exchange_ids: ["ex-002", correction] });
    expect(d.act({ type: "draft_proposed", params: { steps, change_reason: "only when both channels" }, trigger: "agent_tool" })).toMatch(/^ok revision_id=rev-2\. \[TEACH_BACK rev-2 corrects rev-1\]/);
    const rev2 = d.state.revisions[1];
    expect(rev2).toMatchObject({ parent_revision_id: "rev-1", change_exchange_ids: [correction] });
    expect(rev2.change_reason).toContain(correction);
    expect(d.state.revisions[0]).toBe(rev1);
    d.agent("Stop only when both channels show it. Is that right now?");
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } })).toMatch(/stale revision_id rev-1.*rev-2/);
    d.expert("Yes, exactly.");
    d.act({ type: "revision_confirmed", params: { revision_id: "rev-2", status: "confirmed" } });
    const final = d.state.confirmations.at(-1)!;
    expect(final).toMatchObject({ revision_id: "rev-2", status: "confirmed" });
    expect(final.step_ids_reviewed).toEqual([rev2.steps.at(-1)!.step_id]);
    expect(validateSessionSnapshot(toSnapshot(d.state)).ok).toBe(true);
  });

  it("propose_draft in teach-back needs a correction first", () => {
    const d = teachBackSession();
    expect(d.act({ type: "draft_proposed", params: null, trigger: "console" })).toMatch(/has not corrected rev-1/);
  });
});
