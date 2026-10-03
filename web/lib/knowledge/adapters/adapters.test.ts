import { describe, expect, it } from "vitest";
import type { DraftRevision, OpenQuestion } from "@/lib/expert/contracts";
import { loadSynthesisScenario } from "@/fixtures/ws5/synthesis/load";
import { parseEntryMarkdown } from "../markdown";
import type { KnowledgeEntryContent } from "../schema";
import { ws3Synthesis, type Ws3SynthesisModule, type Ws3SynthesisState } from "./ws3-synthesis";
import { createWs6SynthesisModule, type Ws6KnowledgeRevision, type Ws6SynthesisModule } from "./ws6-synthesis-module";

const scenario = loadSynthesisScenario();
const state: Ws3SynthesisState = {
  session_id: "fixture-session-001",
  events: scenario.events,
  exchanges: scenario.exchanges,
  confirmations: [],
};

describe("WS3 adapter (getGaps / buildDraft)", () => {
  it("type-checks against the documented WS3 interface", () => {
    const m: Ws3SynthesisModule = ws3Synthesis;
    const gap: OpenQuestion = m.getGaps(state)[0];
    const draft: DraftRevision = m.buildDraft(state);
    expect(gap.open_question_id).toMatch(/^gap-/);
    expect(draft.revision_id).toBe("rev-1");
  });

  it("returns gaps as open questions, highest priority first", () => {
    const gaps = ws3Synthesis.getGaps(state);
    expect(gaps[0]).toMatchObject({ open_question_id: "gap-unclear_guardrail-evt-002", kind: "unclear_guardrail", priority: 1, answered_by_exchange_id: null });
    expect(gaps.length).toBeGreaterThanOrEqual(3);
  });

  it("builds a DraftRevision whose steps carry both event and exchange support", () => {
    const draft = ws3Synthesis.buildDraft(state);
    expect(draft.parent_revision_id).toBeNull();
    expect(draft.steps.length).toBe(7);
    for (const s of draft.steps) {
      expect(s.supporting_event_ids.length).toBeGreaterThan(0);
      expect(s.supporting_exchange_ids.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
    }
    expect(draft.steps.find(s => s.step_id === "ent-evt-002-escalation")?.kind).toBe("guardrail");
  });

  it("keeps the parent when nothing changed and makes rev-(n+1) on a correction", () => {
    const rev1 = ws3Synthesis.buildDraft(state);
    expect(ws3Synthesis.buildDraft(state, rev1)).toBe(rev1);
    const corrected = ws3Synthesis.buildDraft({ ...state, confirmations: [scenario.correction] }, rev1);
    expect(corrected.revision_id).toBe("rev-2");
    expect(corrected.parent_revision_id).toBe("rev-1");
    expect(corrected.change_reason).toContain("ent-evt-001-step");
    expect(corrected.steps.find(s => s.step_id === "ent-evt-001-step")?.supporting_exchange_ids).toContain("sx-010");
  });
});

describe("WS6 adapter (SynthesisModule)", () => {
  // A minimal in-memory stand-in for WS6's store: it keeps what the module returned.
  const store = new Map<string, { meta: Ws6KnowledgeRevision; markdown: string }>();
  const module: Ws6SynthesisModule = createWs6SynthesisModule({
    load_content: r => {
      const hit = store.get(r.revision_id);
      return hit ? parseEntryMarkdown(hit.markdown) : null;
    },
  });
  const persist = (revs: Awaited<ReturnType<Ws6SynthesisModule["synthesize"]>>["revisions"]) =>
    revs.map(r => {
      const meta: Ws6KnowledgeRevision = {
        schema_version: "ws6.v0",
        entry_id: r.entry_id,
        revision_id: `rev-ws6-${r.entry_id}-${r.revision_no}`,
        revision_no: r.revision_no,
        parent_revision_id: r.parent_revision_id,
        status: "confirmed",
        content_path: `entries/${r.entry_id}/rev-${r.revision_no}.md`,
        evidence: r.evidence,
        produced_by: r.produced_by,
        created_at_utc: r.content.created_at_utc,
      };
      store.set(meta.revision_id, { meta, markdown: r.markdown });
      return meta;
    });

  it("exposes id/version and returns revisions, workflow Markdown, gaps and teach-back", async () => {
    expect(module.id).toBe("ws5-synthesis");
    const result = await module.synthesize({ session: { session_id: "fixture-session-001", source: "fixture" }, events: scenario.events, exchanges: scenario.exchanges, prior: [] });
    expect(result.revisions).toHaveLength(7);
    expect(result.revisions[0]).toMatchObject({ revision_no: 1, parent_revision_id: null, status: "draft", produced_by: { module: "ws5-synthesis", source: "fixture" } });
    expect(result.workflow_markdown).toContain("entries/ent-evt-001-step/rev-1.md");
    expect(result.gaps.length).toBeGreaterThanOrEqual(3);
    expect(result.teach_back).toMatch(/\?$/);
    for (const r of result.revisions) expect(parseEntryMarkdown(r.markdown)).toEqual(r.content);
  });

  it("dedupes unchanged input and maps a correction's parent to the WS6 revision id", async () => {
    const session = { session_id: "fixture-session-001", source: "fixture" as const };
    const first = await module.synthesize({ session, events: scenario.events, exchanges: scenario.exchanges, prior: [] });
    const prior = persist(first.revisions);
    const again = await module.synthesize({ session, events: scenario.events, exchanges: scenario.exchanges, prior });
    expect(again.revisions).toEqual([]);

    const corrected = await module.synthesize({ session, events: scenario.events, exchanges: scenario.exchanges, prior, confirmations: [scenario.correction] });
    expect(corrected.revisions.map(r => [r.entry_id, r.revision_no, r.parent_revision_id])).toEqual([["ent-evt-001-step", 2, "rev-ws6-ent-evt-001-step-1"]]);
    expect(corrected.flagged_for_reconfirmation.map(f => f.revision_id)).toEqual([
      "rev-ws6-ent-evt-001-exception-1",
      "rev-ws6-ent-evt-001-guardrail-1",
    ]);
    const content: KnowledgeEntryContent = corrected.revisions[0].content;
    expect(content.change_reason).toContain("sx-010");
  });
});
