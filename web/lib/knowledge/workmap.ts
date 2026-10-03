// Work Map content: each workflow step with the expert's verbatim words, the AI synthesis (tagged),
// guardrails, the screen moments and the confirmation. WS6 serves it from GET /api/workmap; WS7
// renders it. A link that does not resolve is reported in broken_links, never dropped silently.

import type { ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import { isTeachable, type EligibilityContext } from "./eligibility";
import type { ExpertQuote, KnowledgeEntryContent, Statement } from "./schema";
import type { WorkflowDoc, WorkMapAsset, WorkMapContent, WorkMapExpertWords, WorkMapStep } from "./synthesis-types";

export type WorkMapInput = {
  workflow: WorkflowDoc;
  /** Stored revisions; the ones the workflow links are looked up by entry_id + revision_id. */
  revisions: readonly KnowledgeEntryContent[];
  events: readonly PointingEvent[];
  exchanges: readonly ExpertExchange[];
  /** When given, an asset_id not listed here is a broken link. */
  assets?: readonly WorkMapAsset[];
  /** Show drafts and unresolved entries too, each with its status. Revoked entries never show. */
  include_draft?: boolean;
  /** When given (and include_draft is off), only revisions that may teach are shown. */
  eligibility?: Pick<EligibilityContext, "current_revision_by_entry" | "allow_fixture">;
};

export type { WorkMapContent, WorkMapStep };

function why(entry: KnowledgeEntryContent, input: WorkMapInput): string | null {
  if (entry.status === "revoked") return `revoked: ${entry.revoked_reason ?? "no reason given"}`;
  if (input.include_draft) return null;
  if (input.eligibility) {
    const t = isTeachable(
      { record_type: "knowledge_entry", path: null, entry },
      { ...input.eligibility, exchanges: input.exchanges, events: input.events }
    );
    return t.ok ? null : `${t.reason}: ${t.detail}`;
  }
  return entry.status === "confirmed" ? null : `status is ${entry.status}`;
}

export function buildWorkMap(input: WorkMapInput): WorkMapContent {
  const revisions = new Map(input.revisions.map(r => [`${r.entry_id}@${r.revision_id}`, r]));
  const events = new Map(input.events.map(e => [e.event_id, e]));
  const exchanges = new Map(input.exchanges.map(x => [x.exchange_id, x]));
  const assets = input.assets ? new Map(input.assets.map(a => [a.asset_id, a])) : null;

  const steps: WorkMapStep[] = [];
  const excluded: WorkMapContent["excluded"] = [];

  for (const ws of input.workflow.steps) {
    const ref = `${ws.entry_id}@${ws.revision_id}`;
    const entry = revisions.get(ref);
    if (!entry) {
      steps.push({
        position: ws.position,
        entry_id: ws.entry_id,
        revision_id: ws.revision_id,
        status: ws.status,
        kind: ws.kind,
        title: ws.title,
        expert_words: [],
        synthesis: [],
        guardrails: [],
        visual: [],
        confirmation: null,
        broken_links: [`revision ${ref} not found`],
      });
      continue;
    }
    const reason = why(entry, input);
    if (reason) {
      excluded.push({ entry_id: entry.entry_id, revision_id: entry.revision_id, reason });
      continue;
    }
    steps.push(buildStep(ws, entry, { events, exchanges, assets }));
  }
  return { steps, excluded };
}

type Lookups = {
  events: ReadonlyMap<string, PointingEvent>;
  exchanges: ReadonlyMap<string, ExpertExchange>;
  assets: ReadonlyMap<string, WorkMapAsset> | null;
};

function buildStep(ws: WorkflowDoc["steps"][number], entry: KnowledgeEntryContent, l: Lookups): WorkMapStep {
  const broken: string[] = [];
  const report = (msg: string) => {
    if (!broken.includes(msg)) broken.push(msg);
  };

  const words = (quotes: ExpertQuote[]): WorkMapExpertWords[] =>
    quotes.flatMap(q => {
      const x = l.exchanges.get(q.exchange_id);
      if (!x) return report(`exchange ${q.exchange_id} not found`), [];
      if (x.record_state !== "on_record") return report(`exchange ${q.exchange_id} is off-record`), [];
      if (!x.answer_lines.some(line => line.text.includes(q.quote))) {
        return report(`quote from ${q.exchange_id} is not verbatim in its answer lines`), [];
      }
      return [{ exchange_id: q.exchange_id, question: x.question, quote: q.quote }];
    });
  const quotesIn = (...s: Statement[]): ExpertQuote[] =>
    s.flatMap(x => (x.type === "expert_quote" ? [{ exchange_id: x.exchange_id, quote: x.quote }] : []));

  const synthesis = [entry.workflow_step, entry.observation, ...entry.interpretation, ...entry.reasoning, ...entry.exceptions.map(x => x.action)]
    .flatMap(s => (s?.type === "ai_synthesis" ? [{ type: "ai_synthesis" as const, text: s.text }] : []));

  const visual = entry.visual_evidence.map(v => {
    const event = l.events.get(v.event_id);
    if (!event) report(`event ${v.event_id} not found`);
    else if (event.record_state !== "on_record") report(`event ${v.event_id} is off-record`);
    let asset: WorkMapAsset | undefined;
    if (l.assets) {
      asset = v.asset_id ? l.assets.get(v.asset_id) : [...l.assets.values()].find(a => a.event_id === v.event_id);
      if (v.asset_id && !asset) report(`asset ${v.asset_id} for ${v.event_id} not found`);
    }
    return {
      event_id: v.event_id,
      asset_id: asset?.asset_id ?? v.asset_id,
      original_ref: asset?.original_ref ?? v.image_ref,
      highlighted_ref: asset?.highlighted_ref ?? v.highlighted_image_ref,
      region: v.region,
    };
  });

  const expertWords = words(entry.expert_words);
  const guardrails = entry.exceptions.map(x => ({ trigger: x.trigger, action: x.action, expert_words: words(quotesIn(x.trigger, x.action)) }));

  if (!visual.length) report("no screen moment linked");
  if (!expertWords.length) report("no verbatim expert words");

  return {
    position: ws.position,
    entry_id: entry.entry_id,
    revision_id: entry.revision_id,
    status: entry.status,
    kind: entry.kind,
    title: ws.title,
    expert_words: expertWords,
    synthesis,
    guardrails,
    visual,
    confirmation: entry.confirmation,
    broken_links: broken,
  };
}
