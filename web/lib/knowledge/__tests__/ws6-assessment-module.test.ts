import { describe, expect, it } from "vitest";
import { MASTERY_DISCLAIMER } from "../assessment";
import { createWs6AssessmentModule, type Ws6Commit, type Ws6Evaluation } from "../adapters/ws6-assessment-module";
import type { Ws6KnowledgeRevision } from "../adapters/ws6-synthesis-module";
import type { Ws6LearnerDraft } from "../adapters/ws6-tutor-evaluator";
import { ctx, DECISION_QUOTE, fx, GUARDRAIL_QUOTE } from "./helpers";

const ws6Id = (entryId: string, no: number) => `rev-20261004100000-${entryId.slice(4, 12)}-${no}`;
const revision = (entryId: string, no: number): Ws6KnowledgeRevision => ({
  schema_version: "ws6.v0",
  entry_id: entryId,
  revision_id: ws6Id(entryId, no),
  revision_no: no,
  parent_revision_id: null,
  status: "confirmed",
  content_path: `entries/${entryId}/rev-${no}.md`,
  evidence: { event_ids: [], exchange_ids: [], asset_ids: [] },
  produced_by: { module: "ws5-fixtures", version: "0.1.0", source: "fixture" },
  created_at_utc: "2026-10-04T10:00:00.000Z",
});
const revisions = fx.candidates.map(c => revision(c.entry.entry_id, Number(c.entry.revision_id.slice(4))));
const content = new Map(fx.candidates.map(c => [ws6Id(c.entry.entry_id, Number(c.entry.revision_id.slice(4))), c.entry]));
const currentNo = () => Object.fromEntries(Object.entries(ctx.current_revision_by_entry).map(([k, v]) => [k, Number(v.slice(4))]));

const module = (current = currentNo()) =>
  createWs6AssessmentModule({
    load_content: rev => content.get(rev.revision_id)!,
    load_records: async () => ({ exchanges: fx.exchanges, events: fx.events, current_revision_no_by_entry: current }),
    allow_fixture: true,
  });

const draft = (rev: number, decision: string, at: string): Ws6LearnerDraft => ({
  session_id: "sess-fx",
  draft_rev: rev,
  decision,
  reason: "FIXTURE reason",
  visual_context: [],
  updated_at_utc: at,
  source: "fixture",
});
const ev = (id: string, rev: number, outcome: string, cited: Ws6Evaluation["cited"], at: string): Ws6Evaluation => ({
  evaluation_id: id,
  session_id: "sess-fx",
  draft_rev: rev,
  knowledge_revision_ids: [],
  status: "done",
  outcome,
  cited,
  feedback_text: "x",
  created_at_utc: at,
  updated_at_utc: at,
});
const input = () => ({
  session: { session_id: "sess-fx", source: "fixture" as const },
  drafts: [draft(1, "FIXTURE decision A", "2026-10-04T10:00:00.000Z"), draft(2, "FIXTURE decision B", "2026-10-04T10:02:00.000Z")],
  evaluations: [
    ev("ev-1", 1, "intervene", [{ entry_id: "ent-guardrail-c", revision_id: ws6Id("ent-guardrail-c", 1), exchange_ids: ["exc-003"], quote: GUARDRAIL_QUOTE }], "2026-10-04T10:01:00.000Z"),
    ev("ev-2", 2, "ok", [{ entry_id: "ent-decision-a", revision_id: ws6Id("ent-decision-a", 2), exchange_ids: ["exc-009"], quote: DECISION_QUOTE }], "2026-10-04T10:03:00.000Z"),
  ],
  commits: [{ commit_id: "cm-1", session_id: "sess-fx", draft_rev: 2, evaluation_id: "ev-2", at_utc: "2026-10-04T10:04:00.000Z" }] as Ws6Commit[],
  revisions,
  now_utc: "2026-10-04T10:05:00.000Z",
});

describe("createWs6AssessmentModule", () => {
  it("fills WS6's minimal fields and carries the WS5 structure in content", async () => {
    const m = module();
    expect(m.id).toBe("ws5-assessment");
    const { assessment, markdown } = await m.build(input());
    expect(assessment.initial_decision).toBe("FIXTURE decision A");
    expect(assessment.final_outcome).toBe("correct_after_help");
    expect(assessment.assistance).toEqual(["decision 1: intervene on draft rev 1 (caught before save), cited ent-guardrail-c"]);
    expect(assessment.evidence_used).toEqual([
      { entry_id: "ent-guardrail-c", revision_id: ws6Id("ent-guardrail-c", 1) },
      { entry_id: "ent-decision-a", revision_id: ws6Id("ent-decision-a", 2) },
    ]);
    expect(assessment.practice_next[0]).toMatch(/^ent-guardrail-c: Needed a coached correction/);
    expect(assessment.source).toBe("fixture");
    expect(assessment.content.limitations).toContain(MASTERY_DISCLAIMER);
    expect(markdown).toContain("Correct after help");
  });

  it("labels only currently teachable revisions: a guardrail revoked since is listed without its words", async () => {
    const revokedGuardrail = { ...content.get(ws6Id("ent-guardrail-c", 1))!, status: "revoked" as const, revoked_at_utc: "2026-10-04T10:04:30.000Z", revoked_reason: "expert withdrew it" };
    const m = createWs6AssessmentModule({
      load_content: rev => (rev.entry_id === "ent-guardrail-c" ? revokedGuardrail : content.get(rev.revision_id)!),
      load_records: async () => ({ exchanges: fx.exchanges, events: fx.events, current_revision_no_by_entry: currentNo() }),
      allow_fixture: true,
    });
    const { assessment, markdown } = await m.build(input());
    expect(assessment.content.practice_next[0]).toMatchObject({ entry_id: "ent-guardrail-c", still_taught: false, expert_words: null });
    expect(markdown).not.toContain(GUARDRAIL_QUOTE);
  });

  it("refuses citations of revisions it cannot map", async () => {
    const bad = input();
    bad.evaluations[0].cited[0].revision_id = "rev-unknown";
    await expect(module().build(bad)).rejects.toThrow(/unknown WS6 revision/);
  });
});
