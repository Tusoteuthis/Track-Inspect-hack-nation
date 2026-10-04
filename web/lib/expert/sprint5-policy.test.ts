// Sprint 5: bounded questioning and expert control (notes/voice-agent-strategy-handoff.md §6–§11,
// decisions D1–D10 in notes/ws3-sprints/sprint-5-strategy-alignment.md), through the real reducer.
import { describe, expect, it } from "vitest";
import { detectControlPhrase } from "./controls";
import { deriveCompletion } from "./completion";
import { toSnapshot } from "./session";
import { driver } from "./test-driver";

const SID = "ses-20261004-140000-s5po";
const q = (event_id: string, kind: string, question = `A ${kind} question?`) => ({ event_id, kind, question });

describe("live budget and per-topic limits (D1, D2)", () => {
  it("allows one opening question and one follow-up per topic, then declines", () => {
    const d = driver(SID);
    d.event("evt-001");
    expect(d.ask(q("evt-001", "explain"))).toMatch(/^ok/);
    d.expert("That spike is the wheel set.");
    expect(d.ask(q("evt-001", "reasoning"))).toMatch(/^ok/);
    d.expert("Because it is narrow.");
    const r = d.ask(q("evt-001", "guardrail"));
    expect(r).toMatch(/^declined topic_followup_used/);
    expect(r).toMatch(/skip_turn/);
    expect(d.state.exchanges).toHaveLength(2);
    expect(d.state.timing.filter(m => m.mark === "question_declined_by_app")).toHaveLength(1);
  });

  it("pointing at the same region again later does not reset the allowance (D3)", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("Wheel set.");
    d.ask(q("evt-001", "reasoning"));
    d.expert("Narrow.");
    d.event("evt-003"); // repeat gesture of evt-001
    expect(d.ask(q("evt-003", "distinction"))).toMatch(/^declined topic_followup_used/);
  });

  it("never re-asks the same kind on a topic once answered", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("Wheel set.");
    expect(d.ask(q("evt-001", "explain", "What is this?"))).toMatch(/^declined repeat/);
  });

  it("caps live questions per session at 5, clarify_reference included, and never frees up (D1, D4)", () => {
    const d = driver(SID);
    d.event("evt-004"); // ambiguous
    expect(d.ask(q("evt-004", "clarify_reference", "Which part do you mean?"))).toMatch(/^ok/);
    d.expert("The upper one.");
    d.ask(q("evt-004", "explain"));
    d.expert("A dip.");
    d.ask(q("evt-004", "reasoning"));
    d.expert("Depth.");
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("Spike.");
    d.event("evt-002");
    expect(d.ask(q("evt-002", "explain"))).toMatch(/^ok/);
    d.expert("Drift.");
    expect(d.state.exchanges.filter(x => x.phase === "live")).toHaveLength(5);
    expect(d.ask(q("evt-002", "guardrail"))).toMatch(/^declined session_budget/);
  });

  it("clarify_reference does not use the topic's follow-up (D4)", () => {
    const d = driver(SID);
    d.event("evt-004");
    d.ask(q("evt-004", "clarify_reference", "Which part do you mean?"));
    d.expert("The upper one.");
    expect(d.ask(q("evt-004", "explain"))).toMatch(/^ok/);
    d.expert("A dip.");
    expect(d.ask(q("evt-004", "reasoning"))).toMatch(/^ok/);
  });

  it("an ambiguous region needs no clarifying question once the expert named the channel (D4)", () => {
    const d = driver(SID);
    d.event("evt-004");
    expect(d.ask(q("evt-004", "explain"))).toMatch(/^error .*clarify_reference/);
    d.expert("This dip on SYS2 is what I look at.");
    expect(d.ask(q("evt-004", "explain"))).toMatch(/^ok/);
  });
});

describe("orientation (D5)", () => {
  it("allows two orientation questions before any pointing; they do not count as live", () => {
    const d = driver(SID);
    expect(d.ask({ event_id: "none", kind: "context", phase: "orient", question: "What decision are you making from these traces?" })).toMatch(/^ok/);
    d.expert("Whether a wheel passed cleanly.");
    expect(d.ask({ event_id: "none", kind: "context", question: "Anything about the channels I should know?" })).toMatch(/^ok/);
    d.expert("SYS1 and SYS2 are two sensor heads.");
    expect(d.ask({ event_id: "none", kind: "context", phase: "orient", question: "Where do you look first?" })).toMatch(/^declined phase_budget/);
    expect(d.state.exchanges.map(x => x.phase)).toEqual(["orient", "orient"]);
    d.event("evt-001");
    expect(d.ask({ event_id: "none", kind: "context", phase: "orient", question: "One more setup question?" })).toMatch(/^declined phase_budget/);
    // the live budget is untouched
    expect(d.ask(q("evt-001", "explain"))).toMatch(/^ok/);
  });
});

describe("expert controls (strategy §5–§6, D11)", () => {
  it("detects the spoken controls conservatively", () => {
    expect(detectControlPhrase("Just listen for a bit.")).toBe("listen_only");
    expect(detectControlPhrase("No questions for now, please.")).toBe("listen_only");
    expect(detectControlPhrase("Okay, you can ask again.")).toBe("questions");
    expect(detectControlPhrase("Questions again.")).toBe("questions");
    expect(detectControlPhrase("Skip that.")).toBe("skip");
    expect(detectControlPhrase("Let's skip that one.")).toBe("skip");
    expect(detectControlPhrase("Pass.")).toBe("skip");
    expect(detectControlPhrase("Next.")).toBe("next");
    expect(detectControlPhrase("Okay, next one.")).toBe("next");
    expect(detectControlPhrase("Let's move on.")).toBe("next");
    for (const plain of [
      "The next dip is deeper.",
      "On the next sleeper it repeats.",
      "I'd skip lunch for this.",
      "Listen, this one is tricky.",
      "Trains pass here every minute.",
      "No, that's wrong.",
    ]) {
      expect(detectControlPhrase(plain), plain).toBeNull();
    }
  });

  it("'just listen' declines every live question; 'questions again' resumes without a burst", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.expert("Just listen for now.");
    expect(d.state.interaction_mode).toBe("listen_only");
    expect(d.ask(q("evt-001", "explain"))).toMatch(/^declined listen_only/);
    d.expert("Okay, you can ask again.");
    expect(d.state.interaction_mode).toBe("questions");
    expect(d.ask(q("evt-001", "explain"))).toMatch(/^ok/);
  });

  it("control lines are never stored as answers", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("Skip that.");
    expect(d.state.exchanges[0].answer_lines).toHaveLength(0);
    expect(d.state.transcript.at(-1)).toMatchObject({ role: "user", text: "Skip that.", exchange_id: null });
  });

  it("'skip that' declines the question for good; the tool afterwards is a no-op (idempotent)", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("Skip that.");
    expect(d.state.exchanges[0].outcome).toBe("declined");
    const before = d.state;
    d.act({ type: "control_requested", control: "skip", trigger: "agent_tool" });
    expect(d.state.exchanges).toEqual(before.exchanges);
    expect(d.ask(q("evt-001", "explain", "So what do you see here?"))).toMatch(/^declined repeat/);
  });

  it("'next' closes the current topic; nothing more is asked about it", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("A spike from the wheel.");
    d.expert("Next.");
    expect(d.state.topics[0].state).toBe("closed");
    expect(d.ask(q("evt-001", "reasoning"))).toMatch(/^declined topic_closed/);
    d.event("evt-002");
    expect(d.ask(q("evt-002", "explain"))).toMatch(/^ok/);
  });

  it("'I'm done' still ends the task while just listening", () => {
    const d = driver(SID);
    d.event("evt-001");
    d.expert("Just listen.");
    expect(d.act({ type: "task_completed", trigger: "agent_tool" })).toMatch(/^ok phase=debrief/);
    expect(d.state.interaction_mode).toBe("questions");
  });
});

describe("bounded debrief and teach-back (D6, D7)", () => {
  function toTeachBack() {
    const d = driver(SID);
    d.event("evt-001");
    d.ask(q("evt-001", "explain"));
    d.expert("That spike is usually from the wheel set passing a gap.");
    d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "covered", note: "spike" }] } });
    d.act({ type: "task_completed", trigger: "agent_tool" });
    return d;
  }

  it("opens at most 3 gaps, guardrail first when no guardrail was asked live; dropped gaps cannot be asked", () => {
    const d = toTeachBack();
    const open = d.state.debrief_agenda.filter(g => g.state === "open");
    expect(open).toHaveLength(3);
    expect(open[0].dimension).toBe("guardrails");
    const dropped = d.state.debrief_agenda.find(g => g.state === "dropped");
    if (dropped) {
      expect(d.ask({ event_id: dropped.event_id ?? "none", kind: "gap", phase: "debrief", gap_id: dropped.gap_id, question: "?" })).toMatch(/dropped/);
    }
  });

  it("after one correction pass, a further correction ends the session as incomplete with the unconfirmed steps listed", () => {
    const d = toTeachBack();
    for (const g of d.state.debrief_agenda.filter(x => x.state === "open")) {
      d.ask({ event_id: g.event_id ?? "none", kind: "gap", phase: "debrief", gap_id: g.gap_id, question: "Debrief?" });
      d.expert("I would escalate that.");
    }
    d.act({
      type: "draft_proposed",
      trigger: "agent_tool",
      params: { steps: [{ kind: "step", text: "Scan SYS1 for a narrow spike.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] }] },
    });
    expect(d.state.phase).toBe("teach_back");
    d.agent("First scan SYS1 for a narrow spike. Is that right?");
    d.expert("No, only when it repeats.");
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "corrected" } })).toMatch(/propose_draft/);
    d.act({
      type: "draft_proposed",
      trigger: "agent_tool",
      params: { steps: [{ kind: "step", text: "Scan SYS1 for a narrow spike that repeats.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] }], change_reason: "only when it repeats" },
    });
    d.agent("Scan SYS1 for a narrow spike that repeats. Is that right?");
    d.expert("Still not quite.");
    const r = d.act({ type: "revision_confirmed", params: { revision_id: "rev-2", status: "corrected" } });
    expect(r).toMatch(/correction pass is used up/);
    expect(d.state.phase).toBe("incomplete");
    expect(d.act({ type: "draft_proposed", trigger: "agent_tool", params: { steps: [] } })).toMatch(/^error/);

    d.act({ type: "session_ended", cause: "stop" });
    const c = deriveCompletion(toSnapshot(d.state));
    expect(c.end_reason).toBe("incomplete");
    expect(c.confirmed_revision_id).toBeNull();
    expect(c.unfinished.join("\n")).toMatch(/unconfirmed steps in rev-2/);
  });

  it("reports challenge shortfalls honestly instead of padding (D10)", () => {
    const d = toTeachBack();
    d.act({ type: "session_ended", cause: "stop" });
    const text = deriveCompletion(toSnapshot(d.state)).unfinished.join("\n");
    expect(text).toMatch(/only 1 live question/);
    expect(text).toMatch(/no live guardrail question/);
  });
});
