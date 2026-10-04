import { describe, expect, it } from "vitest";
import type { Citation, TutorEvaluation } from "../evaluation-types";
import type { LearnerScreenContext } from "../observation";
import {
  buildEvaluationContextBlock,
  buildKnowledgeChangedBlock,
  buildSessionContextBlock,
  TutorContextError,
  type ContextEvaluation,
} from "../tutor-context";
import { ctx, DECISION_QUOTE, ESCALATION_QUOTE, fx, GUARDRAIL_QUOTE } from "./helpers";

const knowledge = { candidates: fx.candidates, ctx };
const cite = (entry_id: string, quote: string, exchange_ids: string[], revision_id = "rev-1"): Citation => ({ entry_id, revision_id, exchange_ids, quote });
const guardrail = cite("ent-guardrail-c", GUARDRAIL_QUOTE, ["exc-003"]);

const intervene = (over: Partial<ContextEvaluation> = {}): ContextEvaluation => ({
  outcome: "intervene",
  cited: [guardrail],
  guiding_question: "What do you see on the second channel before you save?",
  uncertainty: null,
  escalation: null,
  evidence: [{ entry_id: "ent-guardrail-c", event_id: "evt-002", highlighted_image_ref: "h.svg", image_ref: "o.svg" }],
  ...over,
});

const screen: LearnerScreenContext = {
  frame_asset_id: "frm-001",
  region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, coordinate_space: "original_frame_normalized", frame_width_px: 1600, frame_height_px: 900 },
  visible_case_id: "fx-case-102",
  draft_rev: 1,
  captured_at_utc: "2026-10-04T10:00:00.000Z",
  source: "app_state",
};

const block = (evaluation: ContextEvaluation, over: { screen?: LearnerScreenContext | null; draft_rev?: number } = {}) =>
  buildEvaluationContextBlock({ evaluation_id: "ev-001", draft_rev: over.draft_rev ?? 1, evaluation, knowledge, screen: over.screen ?? null });

describe("buildEvaluationContextBlock", () => {
  it("carries outcome, guiding question first, then the verbatim citation with its ids and evidence", () => {
    const { text, contextId } = block(intervene(), { screen });
    expect(contextId).toBe("ws5-evaluation-ev-001");
    expect(text.startsWith("[EVALUATION eid=ev-001 draft_rev=1 outcome=intervene]")).toBe(true);
    expect(text.trimEnd().endsWith("[/EVALUATION]")).toBe(true);
    const q = text.indexOf("guiding_question:");
    const c = text.indexOf("expert_quote 1:");
    expect(q).toBeGreaterThan(0);
    expect(c).toBeGreaterThan(q);
    expect(text).toContain(`"${GUARDRAIL_QUOTE}"`);
    expect(text).toContain("entry ent-guardrail-c rev-1");
    expect(text).toContain("kind guardrail");
    expect(text).toContain("exchange exc-003");
    expect(text).toContain("event evt-002");
    expect(text).toContain("learner_screen: The learner marked a region");
    expect(text).not.toContain("fx-case-102");
  });

  it("states the teaching rules inside the block", () => {
    const { text } = block(intervene());
    expect(text).toMatch(/ask the guiding question first/i);
    expect(text).toMatch(/quote only the expert_quote lines/i);
  });

  it("quotes nothing but the citations", () => {
    const { text } = block(intervene());
    const quoted = [...text.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    expect(quoted).toEqual([GUARDRAIL_QUOTE]);
  });

  it("for uncertain: carries the uncertainty and the escalation rule's verbatim words", () => {
    const { text } = block(
      intervene({
        outcome: "uncertain",
        cited: [],
        evidence: [],
        uncertainty: "The confirmed knowledge does not cover the third channel.",
        escalation: { entry_id: "ent-escalate-unclear", revision_id: "rev-1" },
      })
    );
    expect(text).toContain("outcome=uncertain");
    expect(text).toContain("uncertainty: The confirmed knowledge does not cover the third channel.");
    expect(text).toContain(`escalation: follow the expert's escalation rule, expert_quote 1`);
    expect(text).toContain(`"${ESCALATION_QUOTE}"`);
  });

  it("for uncertain without an escalation rule: tells the tutor to ask for context, never to decide", () => {
    const { text } = block(intervene({ outcome: "uncertain", cited: [], evidence: [], uncertainty: null }));
    expect(text).toContain("escalation: none");
    expect(text).toMatch(/not covered/i);
  });

  it("for ok: lists what the expert's words support, without claiming mastery", () => {
    const { text } = block(intervene({ outcome: "ok", cited: [cite("ent-decision-a", DECISION_QUOTE, ["exc-009"], "rev-2")], evidence: [] }));
    expect(text).toContain("outcome=ok");
    expect(text).not.toMatch(/master/i);
  });

  it("says when no region was marked", () => {
    expect(block(intervene()).text).toContain("learner_screen: No screen context");
  });

  it.each([
    ["a revoked entry", cite("ent-revoked-a", "I choose FIXTURE decision A", ["exc-001"])],
    ["an unresolved entry", cite("ent-unresolved-b", "region B looks different, I am not sure yet what it means.", ["exc-006"])],
    ["an off-record entry", cite("ent-offrecord-e", "off-record remark about region E.", ["exc-008"])],
    ["a superseded revision", cite("ent-decision-a", "I choose FIXTURE decision A only if FIXTURE cue B is also visible.", ["exc-002"], "rev-1")],
    ["an unknown entry", cite("ent-nope", "anything at all", ["exc-001"])],
  ])("refuses %s", (_name, c) => {
    expect(() => block(intervene({ cited: [c], evidence: [] }))).toThrow(TutorContextError);
  });

  it("refuses a quote that is not verbatim in the expert's words", () => {
    const tampered = cite("ent-guardrail-c", GUARDRAIL_QUOTE.replace("never", "rarely"), ["exc-003"]);
    expect(() => block(intervene({ cited: [tampered] }))).toThrow(TutorContextError);
  });

  it("refuses a citation whose exchange ids are not where the quote is", () => {
    expect(() => block(intervene({ cited: [cite("ent-guardrail-c", GUARDRAIL_QUOTE, ["exc-001"])] }))).toThrow(TutorContextError);
  });

  it("refuses a guiding question or uncertainty that quotes uncited text", () => {
    expect(() => block(intervene({ guiding_question: 'Did the expert say "always save decision A"?' }))).toThrow(TutorContextError);
    expect(() => block(intervene({ outcome: "uncertain", cited: [], evidence: [], uncertainty: 'He said "pattern Z is fine".' }))).toThrow(
      TutorContextError
    );
  });

  it("refuses an escalation that is not a teachable escalation rule", () => {
    expect(() => block(intervene({ outcome: "uncertain", cited: [], evidence: [], escalation: { entry_id: "ent-guardrail-c", revision_id: "rev-1" } }))).toThrow(
      TutorContextError
    );
  });

  it("refuses a screen context from another draft revision", () => {
    expect(() => block(intervene(), { screen: { ...screen, draft_rev: 2 } })).toThrow(TutorContextError);
  });

  it("carries no evaluator material even if the evaluation object has extra fields", () => {
    const sneaky = { ...intervene(), expected_decision: "SECRET-ANSWER", evaluator_notes: "SECRET-NOTES" } as ContextEvaluation;
    const { text } = block(sneaky);
    expect(text).not.toContain("SECRET");
  });

  it("accepts a full TutorEvaluation as produced by evaluate()", () => {
    const full: TutorEvaluation = {
      ...intervene(),
      cited: [guardrail],
      evidence: [],
      feedback_text: "x",
      guard_notes: [],
      produced_by: { module: "ws5-tutor", version: "0.3.0", judge: "mock" },
      outcome: "intervene",
    };
    expect(block(full).text).toContain("outcome=intervene");
  });
});

describe("buildSessionContextBlock", () => {
  it("orients the tutor without any knowledge text", () => {
    const { text, contextId } = buildSessionContextBlock({ session_id: "sess-001", pinned_count: 4, source: "fixture", screen: null });
    expect(contextId).toBe("ws5-session-sess-001");
    expect(text).toContain("[SESSION");
    expect(text).toContain("4 confirmed expert entries");
    expect(text).toContain("source=fixture");
    expect(text).not.toContain('"');
  });
});

describe("buildKnowledgeChangedBlock", () => {
  it("withdraws entries by id without repeating their words", () => {
    const { text, contextId } = buildKnowledgeChangedBlock({ session_id: "sess-001", withdrawn: [{ entry_id: "ent-guardrail-c", revision_id: "rev-1" }] });
    expect(contextId).toMatch(/^ws5-knowledge-changed-sess-001-/);
    expect(text).toContain("[KNOWLEDGE_CHANGED");
    expect(text).toContain("ent-guardrail-c");
    expect(text).toMatch(/do not (use|repeat)/i);
    expect(text).not.toContain(GUARDRAIL_QUOTE);
  });
});
