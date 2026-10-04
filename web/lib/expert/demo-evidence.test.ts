import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "./contracts";
import { type ChecklistRow, demoChecklist, renderDemoEvidenceMd } from "./demo-evidence";
import { toSnapshot } from "./session";
import { SENTINEL, driver, fullSession } from "./test-driver";

const full = () => toSnapshot(fullSession("ses-20261004-120000-dem1").state);
const row = (rows: ChecklistRow[], id: ChecklistRow["id"]) => rows.find(r => r.id === id)!;

describe("demoChecklist", () => {
  it("is all ✓ for a full session", () => {
    const rows = demoChecklist(full());
    expect(rows.map(r => [r.id, r.ok])).toEqual([
      ["live_questions", true],
      ["live_guardrail", true],
      ["debrief_questions", true],
      ["teach_back", true],
      ["evidence_links", true],
      ["off_record", true],
    ]);
    expect(row(rows, "live_questions").links.join(" ")).toMatch(/ex-001.*evt-001/);
  });

  it("each row fails when its evidence is missing", () => {
    const snap = full();
    const without = (pred: (x: SessionSnapshot["exchanges"][number]) => boolean): SessionSnapshot => ({ ...snap, exchanges: snap.exchanges.map(x => (pred(x) ? { ...x, question: "" } : x)) });
    expect(row(demoChecklist(without(x => x.exchange_id === "ex-003")), "live_questions").ok).toBe(false);
    expect(row(demoChecklist(without(x => x.kind === "guardrail")), "live_guardrail").ok).toBe(false);
    expect(row(demoChecklist(without(x => x.exchange_id === "ex-005")), "debrief_questions").ok).toBe(false);
    expect(row(demoChecklist({ ...snap, confirmations: [] }), "teach_back").ok).toBe(false);
    const unsupported = { ...snap, revisions: snap.revisions.map(r => ({ ...r, steps: r.steps.map((s, i) => (i === 1 ? { ...s, supporting_event_ids: [], supported: false } : s)) })) };
    expect(row(demoChecklist(unsupported), "evidence_links").ok).toBe(false);
    expect(row(demoChecklist({ ...snap, recording_segments: snap.recording_segments.slice(0, 1).map(s => ({ ...s, ended_at_utc: null })) }), "off_record")).toMatchObject({
      ok: false,
      detail: expect.stringMatching(/not exercised/),
    });
  });

  it("a debrief question only counts when the expert answered it", () => {
    const snap = full();
    const debrief = snap.exchanges.filter(x => x.phase === "debrief");
    const unanswered = { ...snap, exchanges: snap.exchanges.map(x => (x.exchange_id === debrief[0].exchange_id ? { ...x, answer_lines: [] } : x)) };
    expect(row(demoChecklist(unanswered), "debrief_questions").ok).toBe(false);
  });

  it("a live question that interrupted the expert does not count as asked at a pause", () => {
    const d = driver("ses-20261004-120000-dem2");
    for (const [i, evt] of ["evt-001", "evt-002", "evt-004"].entries()) {
      d.event(evt);
      if (i === 2) d.act({ type: "user_speech_changed", speaking: true });
      d.act({ type: "question_begun", params: { event_id: evt, kind: i === 2 ? "clarify_reference" : "explain", question: "Which part?" } });
      d.act({ type: "agent_speaking_changed", speaking: true });
      d.agent("Which part?");
      d.act({ type: "agent_speaking_changed", speaking: false });
      if (i === 2) d.act({ type: "user_speech_changed", speaking: false });
      d.expert("The upper one.");
    }
    const r = row(demoChecklist(toSnapshot(d.state)), "live_questions");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/2 of 3/);
  });
});

describe("renderDemoEvidenceMd", () => {
  it("has the checklist, annotated transcript, timing table and live/fixture section, without excluded content", () => {
    const md = renderDemoEvidenceMd(full());
    for (const re of [/## Challenge checklist/, /\| ✓ \|/, /## Annotated transcript/, /## Timing per question/, /## Live vs fixture/, /FIXTURE/, /off-record segment from/]) {
      expect(md).toMatch(re);
    }
    expect(md).toMatch(/\| debrief \| expert \| ex-0\d\d/);
    expect(md.toLowerCase()).not.toContain(SENTINEL);
  });
});
