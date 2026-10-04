import { describe, expect, it } from "vitest";
import { validateSessionSnapshot } from "./contracts";
import { selectGaps } from "./coverage";
import { activeConfirmations, stepVerification } from "./draft";
import { phaseBlock } from "./debrief";
import { toSnapshot } from "./session";
import { driver } from "./test-driver";

const A1 = "That spike is usually from the wheel set passing a gap.";
const A2 = "If both channels show the mango signature I stop and call the measurement team.";
const has = (v: unknown, needle: string) => JSON.stringify(v).toLowerCase().includes(needle.toLowerCase());

/** Live Q&A on evt-001, debrief, rev-1 citing both answers, explicit confirmation. */
function confirmedSession() {
  const d = driver("ses-20261004-100000-str1");
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert(A1);
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "covered", note: "spike from gap" }] } });
  d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else?" });
  d.expert(A2);
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "mango signature: call team" }] } });
  d.act({ type: "task_completed", trigger: "console" });
  d.act({
    type: "draft_proposed",
    trigger: "console",
    params: {
      steps: [
        { kind: "step", text: "Scan SYS1 for a narrow spike; it is usually the wheel set passing a gap.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] },
        { kind: "guardrail", text: "If both channels show the mango signature, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
      ],
    },
  });
  d.agent("First scan SYS1 for a narrow spike. If both channels show the mango signature, stop and call the team. Is that right?");
  d.expert("Yes, that's right.");
  d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } });
  expect(d.state.phase).toBe("confirmed");
  return d;
}

describe("strike_last_answer", () => {
  it("refuses when nothing is recorded", () => {
    const d = driver("ses-20261004-100000-str0");
    expect(d.act({ type: "strike_requested", trigger: "agent_tool" })).toMatch(/^error nothing to strike/);
    expect(d.state.strikes).toEqual([]);
  });

  it("striking the confirming answer invalidates the confirmation and requires a new one", () => {
    const d = confirmedSession();
    d.expert("Sorry, forget what I just said.");
    const result = d.act({ type: "strike_requested", trigger: "agent_tool" })!;
    expect(result).toMatch(/^ok struck ex-00\d/);
    expect(result).toMatch(/confirmation .* no longer counts/i);
    const [strike] = d.state.strikes;
    expect(strike.invalidated_confirmation_ids).toEqual(["conf-001"]);
    expect(strike.superseded_revision_ids).toEqual([]);
    expect(d.state.phase).toBe("teach_back");
    expect(d.state.phase_log.at(-1)).toMatchObject({ phase: "teach_back", trigger: "strike" });
    expect(activeConfirmations(d.state)).toEqual([]);
    expect(Object.values(stepVerification(d.state.revisions, activeConfirmations(d.state)))).not.toContain("confirmed");
    // a fresh teach-back exchange waits for the re-ask, and old words cannot confirm again
    const open = d.state.exchanges.find(x => x.exchange_id === d.state.awaiting_question_exchange_id);
    expect(open).toMatchObject({ kind: "teach_back", revision_id: "rev-1", answer_lines: [] });
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } })).toMatch(/no explicit expert response/);
    const snap = toSnapshot(d.state);
    expect(has(snap, "that's right")).toBe(false);
    expect(has(snap, "forget what I just said")).toBe(false);
    expect(validateSessionSnapshot(snap).ok).toBe(true);
  });

  it("striking words a revision relies on supersedes and redacts it; a new revision must be proposed and confirmed", () => {
    const d = confirmedSession();
    d.act({ type: "strike_requested", trigger: "console" }); // the confirmation answer
    d.expert("And forget what I said about the channels.");
    const result = d.act({ type: "strike_requested", trigger: "agent_tool" })!;
    expect(result).toMatch(/^ok struck ex-002/);
    expect(result).toMatch(/propose_draft/);
    const strike = d.state.strikes[1];
    expect(strike.superseded_revision_ids).toEqual(["rev-1"]);
    const rev1 = d.state.revisions[0];
    expect(rev1.steps[1]).toMatchObject({ supported: false });
    expect(rev1.steps[0].text).toContain("wheel set");
    expect(phaseBlock(d.state)).toMatch(/propose_draft/);
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } })).toMatch(/^error/);

    // coverage that relied only on the struck answer is gone; the guardrail gap is askable again
    expect(d.state.coverage.find(c => c.dimension === "guardrails")).toBeUndefined();
    expect(selectGaps(d.state).map(g => g.gap_id)).toContain("gap-evt-001-guardrails");

    const r = d.act({
      type: "draft_proposed",
      trigger: "agent_tool",
      params: { steps: [{ kind: "step", text: "Scan SYS1 for a narrow spike; it is usually the wheel set passing a gap.", event_ids: ["evt-001"], exchange_ids: ["ex-001"] }] },
    })!;
    expect(r).toMatch(/^ok revision_id=rev-2/);
    expect(d.state.revisions[1]).toMatchObject({ parent_revision_id: "rev-1", change_exchange_ids: [] });
    expect(d.state.revisions[1].change_reason).toMatch(/str-002/);
    // the whole procedure is taught again, not only changed steps
    expect(phaseBlock(d.state)).toMatch(/s-1/);

    d.agent("Scan SYS1 for a narrow spike, usually the wheel set passing a gap. Is that right?");
    d.expert("Yes, correct.");
    expect(d.act({ type: "revision_confirmed", params: { revision_id: "rev-2", status: "confirmed" } })).toMatch(/^ok/);
    expect(d.state.phase).toBe("confirmed");

    const snap = toSnapshot(d.state);
    expect(has(snap, "mango")).toBe(false);
    expect(validateSessionSnapshot(snap).ok).toBe(true);
  });

  it("in the debrief, a struck answer reopens its gap", () => {
    const d = driver("ses-20261004-100000-str2");
    d.event("evt-001");
    d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
    d.expert(A1);
    d.act({ type: "coverage_recorded", params: { exchange_id: "ex-001", dimensions: [{ dimension: "decision", status: "covered", note: "spike" }] } });
    d.act({ type: "task_completed", trigger: "console" });
    const gap = d.state.debrief_agenda[0];
    d.ask({ event_id: "evt-001", kind: "gap", phase: "debrief", gap_id: gap.gap_id, question: "When would you stop?" });
    d.expert("When the kiwi pattern shows up twice.");
    d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: gap.dimension, status: "covered", note: "kiwi pattern" }] } });
    expect(d.state.debrief_agenda[0].state).toBe("resolved");
    d.expert("Hmm, scratch that.");
    expect(d.act({ type: "strike_requested", trigger: "agent_tool" })).toMatch(/^ok struck ex-002/);
    expect(d.state.debrief_agenda[0].state).toBe("open");
    expect(has(toSnapshot(d.state), "kiwi")).toBe(false);
    expect(d.state.phase).toBe("debrief");
  });

  it("is refused while off the record", () => {
    const d = confirmedSession();
    d.act({ type: "record_state_changed", to: "off_record", trigger: "console" });
    expect(d.act({ type: "strike_requested", trigger: "agent_tool" })).toMatch(/off the record/);
  });
});
