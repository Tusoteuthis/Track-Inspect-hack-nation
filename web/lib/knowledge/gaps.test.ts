import { describe, expect, it } from "vitest";
import type { ExpertConfirmation, ExpertExchange } from "@/lib/expert/contracts";
import { fixtureImageRef, loadSynthesisScenario, OFF_RECORD_MARKERS } from "@/fixtures/ws5/synthesis/load";
import { findGaps, type GapInput } from "./gaps";
import { synthesize } from "./synthesize";

const scenario = loadSynthesisScenario();
const exchange = (id: string) => {
  const x = scenario.exchanges.find(e => e.exchange_id === id);
  if (!x) throw new Error(id);
  return x;
};
const answer = (over: Partial<ExpertExchange> & { exchange_id: string; text: string }): ExpertExchange => ({
  session_id: "fixture-session-001",
  event_id: null,
  phase: "debrief",
  kind: "gap",
  question: "FIXTURE debrief question",
  question_planned: null,
  asked_at_utc: "2026-10-03T10:20:00.000Z",
  answer_started_at_utc: "2026-10-03T10:20:02.000Z",
  answer_ended_at_utc: "2026-10-03T10:20:04.000Z",
  audio_offset_secs: null,
  record_state: "on_record",
  source: "fixture",
  answer_lines: [{ text: over.text, at_utc: "2026-10-03T10:20:03.000Z", transcript_line_id: `${over.exchange_id}-1` }],
  ...over,
});
const gapsFor = (over: Partial<GapInput> = {}) => {
  const input = { events: scenario.events, exchanges: scenario.exchanges, confirmations: [], prior: [], ...over };
  const entries = synthesize({ ...input, resolve_image_ref: fixtureImageRef }).entries;
  return findGaps({ ...input, entries });
};
const ids = (over: Partial<GapInput> = {}) => gapsFor(over).map(g => g.gap_id);

describe("findGaps", () => {
  it("finds the scenario's genuine gaps, guardrails first", () => {
    expect(ids()).toEqual([
      "gap-unclear_guardrail-evt-002",
      "gap-missing_reason-evt-002",
      "gap-missing_reason-evt-004",
      "gap-unqualified_exception-evt-002",
      "gap-ambiguous_reference-evt-004",
      "gap-missing_evidence-sx-009",
    ]);
    const priorities = gapsFor().map(g => g.priority);
    expect(priorities).toEqual([...priorities].sort());
  });

  it("does not report what was already answered in the session", () => {
    // evt-001 has a reason (sx-002) and an exception for its "usually" (sx-008)
    expect(ids().filter(id => id.includes("evt-001"))).toEqual([]);
  });

  it("drops a gap once a later debrief answer covers it", () => {
    const reason = answer({ exchange_id: "sx-020", event_id: "evt-002", text: "Because FIXTURE cue B1 is present." });
    expect(ids({ exchanges: [...scenario.exchanges, reason] })).not.toContain("gap-missing_reason-evt-002");

    const unless = answer({ exchange_id: "sx-021", event_id: "evt-002", text: "Unless FIXTURE condition F is present." });
    expect(ids({ exchanges: [...scenario.exchanges, unless] })).not.toContain("gap-unqualified_exception-evt-002");

    const clarify = answer({ exchange_id: "sx-022", event_id: "evt-004", kind: "clarify_reference", text: "FIXTURE: the lower one." });
    expect(ids({ exchanges: [...scenario.exchanges, clarify] })).not.toContain("gap-ambiguous_reference-evt-004");
  });

  it("drops a gap answered through its gap id (WS3 gap_answers)", () => {
    const reply = answer({ exchange_id: "sx-023", event_id: "evt-002", text: "Yes, only stop when FIXTURE pattern B is faint." });
    const out = ids({
      exchanges: [...scenario.exchanges, reply],
      gap_answers: [{ exchange_id: "sx-023", gap_id: "gap-unclear_guardrail-evt-002" }],
    });
    expect(out).not.toContain("gap-unclear_guardrail-evt-002");
  });

  it("never pads: a fully answered session has no gaps", () => {
    const evt001 = ["sx-001", "sx-002", "sx-008"].map(exchange);
    expect(ids({ exchanges: evt001 })).toEqual([]);
  });

  it("reports a session with no stop condition at all", () => {
    expect(ids({ exchanges: [exchange("sx-001"), exchange("sx-008")] })).toContain("gap-unclear_guardrail-session");
  });

  it("reports an unanswered guardrail question", () => {
    const unanswered: ExpertExchange = { ...exchange("sx-004"), exchange_id: "sx-030", event_id: "evt-001", answer_lines: [] };
    const out = ids({ exchanges: [exchange("sx-001"), exchange("sx-002"), exchange("sx-008"), unanswered] });
    expect(out).toEqual([]); // sx-002 already states a stop condition at evt-001
    const lone = ids({ exchanges: [exchange("sx-003"), { ...unanswered, event_id: "evt-002" }] });
    expect(lone).toContain("gap-unclear_guardrail-evt-002");
  });

  it("reports a correction that cannot be tied to one step as a conflict", () => {
    const vague: ExpertConfirmation = { ...scenario.correction, step_ids_reviewed: ["ent-evt-001-step", "ent-evt-002-step"] };
    const prior = synthesize({ events: scenario.events, exchanges: scenario.exchanges, confirmations: [], prior: [], resolve_image_ref: fixtureImageRef }).entries;
    const gaps = findGaps({ events: scenario.events, exchanges: scenario.exchanges, confirmations: [vague], prior, entries: prior });
    expect(gaps[0]).toMatchObject({ gap_id: "gap-conflict-cnf-sx-001", kind: "conflict", priority: 1, related_exchange_ids: ["sx-010"] });
  });

  it("reports contradictory confirmations of one revision as a conflict", () => {
    const yes: ExpertConfirmation = { ...scenario.correction, confirmation_id: "cnf-a", status: "confirmed" };
    const unsure: ExpertConfirmation = { ...scenario.correction, confirmation_id: "cnf-b", status: "unresolved" };
    expect(ids({ confirmations: [yes, unsure] })).toContain("gap-conflict-rev-1");
  });

  it("keeps descriptions plain and off-record material out", () => {
    const gaps = gapsFor();
    const json = JSON.stringify(gaps);
    for (const marker of OFF_RECORD_MARKERS) expect(json).not.toContain(marker);
    expect(json).not.toContain("evt-005");
    for (const g of gaps) expect(g.description.length).toBeGreaterThan(0);
  });
});
