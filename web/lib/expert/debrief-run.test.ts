// End-to-end fixture session through the reducer and the file store:
// live → debrief (≥ 3 gap questions) → teach-back rev-1 → correction → rev-2 → confirmation.
// A scripted agent and expert stand in for the voice conversation. It checks the logic
// against the acceptance criteria; it is not live evidence.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CoverageItem, type SessionSnapshot, validateSessionSnapshot } from "./contracts";
import { coverageGrid } from "./coverage";
import { checkQuotes, quotedSpans } from "./draft";
import { toSnapshot } from "./session";
import { createFileStore } from "./store";
import { driver } from "./test-driver";
import { liveCounters } from "./timing";

const SID = "ses-20261004-060000-e2e1";

/** Scripted answers per agenda gap (the agenda is deterministic). */
const DEBRIEF_ANSWERS: Record<string, { answer: string; status: "covered" | "unknown_escalate"; dimension: string }> = {
  "gap-oq-001": { answer: "That drift is the sensor warming up, I ignore it in the first ten minutes.", status: "covered", dimension: "decision" },
  "gap-evt-004-guardrails": { answer: "Honestly I don't know, I'd escalate that to the track engineer.", status: "unknown_escalate", dimension: "guardrails" },
  "gap-evt-001-alternatives": { answer: "A rail gap looks similar, but that shows on both channels with a longer tail.", status: "covered", dimension: "alternatives" },
  "gap-evt-004-alternatives": { answer: "Nothing else I know looks like that dip on both channels.", status: "covered", dimension: "alternatives" },
};

let snap: SessionSnapshot;
let coverageBefore: CoverageItem[];
let agendaIds: string[];
let rejectedDraft: string | null;
let staleConfirm: string | null;
let correctionExchange: string;
let root: string;
let dir: string;

beforeAll(async () => {
  const d = driver(SID);

  // --- live phase ---------------------------------------------------------
  d.event("evt-001");
  d.ask({ event_id: "evt-001", kind: "explain", question: "What do you recognise in this region?" });
  d.expert("That spike is usually from the wheel set passing a gap.");
  d.expert("Twice the amplitude, very narrow.");
  d.act({
    type: "coverage_recorded",
    params: {
      exchange_id: "ex-001",
      dimensions: [
        { dimension: "decision", status: "partial", note: "flags narrow spikes" },
        { dimension: "cues", status: "covered", note: "twice the amplitude, narrow" },
      ],
    },
  });
  d.ask({ event_id: "evt-001", kind: "guardrail", question: "When would you stop and ask someone else about that spike?" });
  d.expert("If both channels show it at the same moment I stop and call the measurement team.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-002", dimensions: [{ dimension: "guardrails", status: "covered", note: "both channels → call team" }] } });
  d.event("evt-003"); // repeat of evt-001: merged, never asked
  d.event("evt-004");
  d.ask({ event_id: "evt-004", kind: "clarify_reference", question: "Which part do you mean: the upper channel, the lower one, or both?" });
  d.expert("Both channels together at that point.");
  d.ask({ event_id: "evt-004", kind: "explain", question: "What do you recognise in that area?" });
  d.expert("That dip and then the slow rise, that tells me to slow down.");
  d.act({ type: "coverage_recorded", params: { exchange_id: "ex-004", dimensions: [{ dimension: "decision", status: "covered", note: "slow down" }] } });
  d.event("evt-002"); // arrives late, never asked live → deferred at task end
  coverageBefore = coverageGrid(d.state);

  // --- debrief ------------------------------------------------------------
  d.expert("Okay, I'm done, that's the task.");
  d.act({ type: "task_completed", trigger: "agent_tool" });
  agendaIds = d.state.debrief_agenda.map(g => g.gap_id);
  for (const gap of d.state.debrief_agenda) {
    const scripted = DEBRIEF_ANSWERS[gap.gap_id];
    if (!scripted) continue;
    d.ask({ event_id: gap.event_id ?? "none", kind: "gap", phase: "debrief", gap_id: gap.gap_id, question: `Could you tell me more: ${gap.description}` });
    d.expert(scripted.answer);
    d.act({
      type: "coverage_recorded",
      params: { exchange_id: d.lastExchangeId(), dimensions: [{ dimension: scripted.dimension, status: scripted.status, note: "AI note" }] },
    });
  }
  const ex = (gap: string) => d.state.exchanges.find(x => x.gap_id === gap)!.exchange_id;

  // --- rev-1: the agent proposes process-shaped steps ---------------------
  rejectedDraft = d.act({
    type: "draft_proposed",
    trigger: "agent_tool",
    params: { steps: [{ kind: "step", text: `A spike "is always a wheel flat".`, event_ids: ["evt-001"], exchange_ids: ["ex-001"] }] },
  });
  d.act({
    type: "draft_proposed",
    trigger: "agent_tool",
    params: {
      steps: [
        { kind: "step", text: `First scan SYS1 for a narrow spike of about "twice the amplitude"; it is "usually from the wheel set passing a gap".`, event_ids: ["evt-001"], exchange_ids: ["ex-001"] },
        { kind: "decision", text: "Then check whether a rail gap could explain it: a rail gap shows on both channels with a longer tail.", event_ids: [], exchange_ids: [ex("gap-evt-001-alternatives")] },
        { kind: "guardrail", text: "If the spike shows on one channel only, stop and call the measurement team.", event_ids: ["evt-001"], exchange_ids: ["ex-002"] },
        { kind: "step", text: "On SYS2, ignore a slow drift during the first ten minutes: it is the sensor warming up.", event_ids: [], exchange_ids: [ex("gap-oq-001")] },
        { kind: "decision", text: "Where a dip is followed by a slow rise on both channels, slow down.", event_ids: ["evt-004"], exchange_ids: ["ex-003", "ex-004"] },
      ],
    },
  });
  d.agent(
    "Here is how I would do it. First, scan the upper channel for a narrow spike about twice the normal amplitude; that is usually the wheel set passing a gap. " +
      "If it shows on one channel only, stop and call the measurement team. Is that right?"
  );
  d.expert("No, that's wrong, it's only when both channels show it at the same moment.");
  correctionExchange = d.lastExchangeId();
  d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "corrected", step_ids_reviewed: d.state.revisions[0].steps.map(s => s.step_id) } });

  // --- rev-2: only the corrected guardrail changes -------------------------
  const rev1 = d.state.revisions[0];
  const steps = rev1.steps.map(s =>
    s.kind === "guardrail" && s.supporting_exchange_ids.includes("ex-002")
      ? { kind: s.kind, text: `Stop and call the measurement team only when both channels show the spike "at the same moment".`, event_ids: ["evt-001"], exchange_ids: ["ex-002", correctionExchange] }
      : { kind: s.kind, text: s.text, event_ids: s.supporting_event_ids, exchange_ids: s.supporting_exchange_ids }
  );
  d.act({ type: "draft_proposed", trigger: "agent_tool", params: { steps, change_reason: "the expert said it is only when both channels show it at the same moment" } });
  d.agent("Corrected: stop and call the measurement team only when both channels show the spike at the same moment. Is that right now?");
  staleConfirm = d.act({ type: "revision_confirmed", params: { revision_id: "rev-1", status: "confirmed" } });
  d.expert("Yes, that's right now.");
  d.act({ type: "revision_confirmed", params: { revision_id: "rev-2", status: "confirmed" } });
  d.act({ type: "session_ended" });
  snap = toSnapshot(d.state);

  root = mkdtempSync(join(tmpdir(), "ws3-e2e-"));
  const store = createFileStore(join(root, "knowledge"), { publicDir: join(root, "web", "public") });
  dir = (await store.saveSnapshot(snap)).dir;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("end-to-end fixture session (debrief → teach-back → correction → confirmation)", () => {
  it("produces a valid snapshot that ends confirmed", () => {
    expect(validateSessionSnapshot(snap)).toEqual({ ok: true, value: snap });
    expect(snap.phase).toBe("confirmed");
    expect(snap.phase_log.map(p => p.phase)).toEqual(["debrief", "teach_back", "confirmed"]);
  });

  it("asks ≥ 3 debrief questions, each tied to an agenda gap that was missing before the debrief", () => {
    const debrief = snap.exchanges.filter(x => x.phase === "debrief");
    expect(debrief.length).toBeGreaterThanOrEqual(3);
    for (const x of debrief) {
      expect(agendaIds).toContain(x.gap_id);
      const gap = snap.debrief_agenda.find(g => g.gap_id === x.gap_id)!;
      if (gap.open_question_id === null) {
        const before = coverageBefore.find(c => c.event_id === gap.event_id && c.dimension === gap.dimension)!;
        expect(before.status).not.toBe("covered");
      } else {
        expect(gap.event_id).toBe("evt-002"); // the deferred topic
      }
      expect(x.answer_lines.length).toBeGreaterThan(0);
    }
    // no debrief question repeats something covered or asked live
    expect(agendaIds).not.toContain("gap-evt-001-guardrails");
    expect(agendaIds).not.toContain("gap-evt-001-cues");
    expect(agendaIds).not.toContain("gap-evt-004-decision");
    const c = liveCounters(snap);
    expect(c).toMatchObject({ live_questions: 4, guardrail_questions: 1, debrief_questions: debrief.length, debrief_gap_questions: debrief.length });
  });

  it("rejects an invented quote and a stale revision id", () => {
    expect(rejectedDraft).toMatch(/quote not verbatim.*is always a wheel flat/);
    expect(staleConfirm).toMatch(/stale revision_id rev-1/);
  });

  it("creates 2 revisions after the correction, with parent and change reason", () => {
    expect(snap.revisions.map(r => r.revision_id)).toEqual(["rev-1", "rev-2"]);
    const [rev1, rev2] = snap.revisions;
    expect(rev2.parent_revision_id).toBe("rev-1");
    expect(rev2.change_exchange_ids).toEqual([correctionExchange]);
    expect(rev2.change_reason).toContain(correctionExchange);
    // the "I'd escalate" answer became a guardrail step
    expect(rev1.steps.some(s => s.kind === "guardrail" && s.text.includes("escalate") && s.supporting_event_ids.includes("evt-004"))).toBe(true);
    // the region-only clarification is not the evidence that makes a step supported
    expect(rev1.steps.every(s => s.supported)).toBe(true);
  });

  it("ends with a confirmation of the latest revision, linked to the expert's explicit words", () => {
    const final = snap.confirmations.at(-1)!;
    expect(snap.confirmations.map(c => [c.revision_id, c.status])).toEqual([
      ["rev-1", "corrected"],
      ["rev-2", "confirmed"],
    ]);
    expect(final.revision_id).toBe(snap.revisions.at(-1)!.revision_id);
    const response = snap.exchanges.find(x => x.exchange_id === final.expert_response_exchange_id)!;
    expect(response.answer_lines.map(l => l.text)).toEqual(["Yes, that's right now."]);
  });

  it("every quote in every revision appears verbatim in the step's linked answer lines", () => {
    for (const rev of snap.revisions) {
      for (const s of rev.steps) {
        const lines = snap.exchanges.filter(x => s.supporting_exchange_ids.includes(x.exchange_id)).flatMap(x => x.answer_lines.map(l => l.text));
        expect(checkQuotes(s.text, lines)).toEqual([]);
      }
    }
  });

  it("writes revisions, confirmations and a knowledge draft with evidence for every step and guardrail", () => {
    expect(readdirSync(join(dir, "revisions")).sort()).toEqual(["rev-1.json", "rev-1.md", "rev-2.json", "rev-2.md"]);
    expect(JSON.parse(readFileSync(join(dir, "confirmations.json"), "utf8"))).toEqual(snap.confirmations);
    const md = readFileSync(join(dir, "knowledge-draft.md"), "utf8");
    const rev2 = snap.revisions[1];
    const sections = md.split(/\n### /).slice(1);
    expect(sections).toHaveLength(rev2.steps.length);
    for (const [i, step] of rev2.steps.entries()) {
      const section = sections[i];
      expect(section.startsWith(`${i + 1}. ${step.step_id} · ${step.kind} · `)).toBe(true);
      expect(section).toMatch(/!\[evt-00\d highlighted\]\(\.\.\/\.\.\/\.\.\/web\/public\/fixtures\/.+\.svg\)/);
      expect(section).toMatch(/\n> \S/); // verbatim expert words
    }
    expect(md).toMatch(/Expert confirmation: \*\*confirmed\*\* in conf-002/);
    expect(md).toContain("## Guardrails");
    expect(md).toContain("FIXTURE");
    // nothing in quotation marks that the expert did not say
    const allLines = snap.exchanges.flatMap(x => x.answer_lines.map(l => l.text));
    const spans = quotedSpans(md.split("## Workflow")[1]);
    expect(spans.length).toBeGreaterThan(0);
    expect(checkQuotes(spans.map(q => `"${q}"`).join(" "), allLines)).toEqual([]);
  });

  it("marks steps confirmed only for the confirmed revision", () => {
    const md = readFileSync(join(dir, "knowledge-draft.md"), "utf8");
    const changed = snap.revisions[1].steps.find(s => s.text.includes("only when both channels"))!;
    expect(md).toContain(`${changed.step_id} · guardrail · confirmed`);
  });
});
