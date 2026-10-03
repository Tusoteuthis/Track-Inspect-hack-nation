// Deterministic synthesis: on-record exchanges and events → draft knowledge entries, an ordered
// workflow, gaps and a teach-back. No LLM, no clock, no domain vocabulary. Expert words are whole
// answer lines copied verbatim; everything else is a fixed, tagged AI template. Same input, same output.

import type { ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import { findQualifiers } from "./cues";
import { findGaps } from "./gaps";
import {
  latestRevisions,
  prepareMaterial,
  ROLE_ORDER,
  roleOfKind,
  type ClassifiedLine,
  type Material,
  type Role,
} from "./material";
import {
  collectQuotes,
  validateEntry,
  WS5_SCHEMA_VERSION,
  type EntryKind,
  type ExpertQuote,
  type KnowledgeEntryContent,
  type Statement,
} from "./schema";
import {
  SYNTHESIS_MODULE,
  type ReconfirmationFlag,
  type SynthesisInput,
  type SynthesisOutput,
  type WorkflowDoc,
} from "./synthesis-types";
import { buildTeachBack } from "./teach-back";

// Process phrasing only. These say what to do with the expert's words, never what a trace means.
const STEP_TEXT: Record<EntryKind, string> = {
  step: "Look at the region the expert pointed to and check it as the expert described.",
  decision: "Look at the region the expert pointed to, check it as the expert described, and decide for the reasons the expert gave.",
  exception: "Before deciding, check whether the exception the expert stated applies.",
  guardrail: "Before saving, check the stop condition the expert stated; if it applies, stop.",
  escalation: "If the condition the expert stated applies, stop and escalate instead of deciding.",
};
const RULE_ACTION: Record<Exclude<Role, "step">, string> = {
  exception: "Apply the exception the expert stated instead of the usual step.",
  guardrail: "Stop; do not continue past this point.",
  escalation: "Stop and escalate.",
};
export const KIND_LABEL: Record<EntryKind, string> = {
  step: "Step",
  decision: "Decision",
  exception: "Exception",
  guardrail: "Guardrail",
  escalation: "Escalation",
};

const synthesis = (text: string): Statement => ({ type: "ai_synthesis", text });
const quote = (l: ClassifiedLine): Statement => ({ type: "expert_quote", exchange_id: l.exchange_id, quote: l.text });
const uniq = <T>(items: T[], key: (t: T) => string) => {
  const seen = new Set<string>();
  return items.filter(t => !seen.has(key(t)) && seen.add(key(t)));
};
const lineKey = (l: ClassifiedLine) => `${l.exchange_id}#${l.line_index}`;
const revisionNo = (revisionId: string) => Number(/^rev-(\d+)$/.exec(revisionId)?.[1] ?? 0);

function observationText(e: PointingEvent): string {
  const where = [e.trace_id ? `trace ${e.trace_id}` : "an unidentified trace", e.channel_id ? `channel ${e.channel_id}` : null]
    .filter(Boolean)
    .join(", ");
  return `The expert pointed at a region of ${where} (event ${e.event_id}).`;
}

/** 32-bit FNV-1a over canonical JSON. Only for change detection, not security. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Hash of what an entry says, ignoring revision bookkeeping (ids, status, timestamps, position). */
export function contentHash(e: KnowledgeEntryContent): string {
  const { kind, workflow_step, observation, expert_words, interpretation, reasoning, exceptions, visual_evidence } = e;
  return fnv1a(
    JSON.stringify([kind, workflow_step, observation, expert_words, interpretation, reasoning, exceptions, visual_evidence, e.qualifiers, e.open_questions, e.source])
  );
}

const supportExchangeIds = (e: KnowledgeEntryContent) => [...new Set(collectQuotes(e).map(q => q.exchange_id))].sort();
const eventIdsOf = (e: KnowledgeEntryContent) => [...new Set(e.visual_evidence.map(v => v.event_id))].sort();

type Group = { event: PointingEvent; role: Role; lines: ClassifiedLine[] };

function groupLines(m: Material): Group[] {
  const groups = new Map<string, Group>();
  for (const l of m.lines) {
    const key = `${l.event_id}|${l.role}`;
    const event = m.events.get(l.event_id);
    if (!event) continue;
    const g = groups.get(key) ?? { event, role: l.role, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function buildContent(
  g: Group,
  entryId: string,
  exchanges: ReadonlyMap<string, ExpertExchange>,
  resolve: SynthesisInput["resolve_image_ref"]
): KnowledgeEntryContent {
  const lines = uniq(g.lines, lineKey);
  const kind: EntryKind = g.role === "step" ? (lines.some(l => l.use === "reasoning") ? "decision" : "step") : g.role;
  const expertWords: ExpertQuote[] = lines.map(l => ({ exchange_id: l.exchange_id, quote: l.text }));
  const supportX = lines.map(l => exchanges.get(l.exchange_id)).filter((x): x is ExpertExchange => !!x);
  const role = g.role;
  return {
    schema_version: WS5_SCHEMA_VERSION,
    entry_id: entryId,
    revision_id: "rev-1",
    parent_revision_id: null,
    change_reason: null,
    status: "draft",
    kind,
    workflow_position: null,
    source: g.event.source === "fixture" || supportX.some(x => x.source === "fixture") ? "fixture" : "live",
    produced_by: { ...SYNTHESIS_MODULE },
    created_at_utc: supportX.map(x => x.answer_ended_at_utc ?? x.asked_at_utc).sort().at(-1) ?? g.event.captured_at_utc,
    revoked_at_utc: null,
    revoked_reason: null,
    workflow_step: synthesis(STEP_TEXT[kind]),
    observation: synthesis(observationText(g.event)),
    expert_words: expertWords,
    interpretation: lines.filter(l => l.use === "interpretation").map(quote),
    reasoning: lines.filter(l => l.use === "reasoning").map(quote),
    exceptions:
      role === "step"
        ? []
        : lines.filter(l => l.use === "rule").map(l => ({ trigger: quote(l), action: synthesis(RULE_ACTION[role]) })),
    visual_evidence: [
      {
        event_id: g.event.event_id,
        asset_id: null,
        image_ref: resolve(g.event.image_ref, entryId),
        highlighted_image_ref: resolve(g.event.highlighted_image_ref, entryId),
        region: g.event.region,
        session_time_ms: g.event.session_time_ms,
        signal_interval: g.event.signal_interval,
      },
    ],
    confirmation: null,
    qualifiers: [...new Set(lines.flatMap(l => findQualifiers(l.text)))],
    open_questions: [],
  };
}

function changeReason(prior: KnowledgeEntryContent, next: KnowledgeEntryContent, corrections: ReadonlyMap<string, string>) {
  const before = new Set(supportExchangeIds(prior));
  const after = new Set(supportExchangeIds(next));
  const added = [...after].filter(x => !before.has(x));
  const removed = [...before].filter(x => !after.has(x));
  if (!added.length && !removed.length) return `content changed with the same support (${[...after].join(", ")})`;
  const parts = [
    added.length ? `added ${added.map(x => (corrections.has(x) ? `${x} (correction ${corrections.get(x)})` : x)).join(", ")}` : null,
    removed.length ? `removed ${removed.join(", ")}` : null,
  ];
  return `support changed: ${parts.filter(Boolean).join("; ")}`;
}

const kindRank = (k: EntryKind) => ROLE_ORDER.indexOf(roleOfKind(k));

export function synthesize(input: SynthesisInput): SynthesisOutput {
  const m = prepareMaterial(input);
  const exchanges = new Map(m.exchanges.map(x => [x.exchange_id, x]));
  const eventsAll = new Map(input.events.map(e => [e.event_id, e]));
  // Only entries this module produced take part; other modules' entries are left alone.
  const latest = latestRevisions(input.prior).filter(e => e.produced_by.module === SYNTHESIS_MODULE.module);
  const latestById = new Map(latest.map(e => [e.entry_id, e]));
  const revokedIds = new Set(latest.filter(e => e.status === "revoked").map(e => e.entry_id));
  const corrections = new Map(
    input.confirmations.filter(c => c.status === "corrected").map(c => [c.expert_response_exchange_id, c.confirmation_id])
  );

  const entryIdFor = (g: Group) => {
    const reuse = latest.find(
      e => !revokedIds.has(e.entry_id) && roleOfKind(e.kind) === g.role && e.visual_evidence[0]?.event_id === g.event.event_id
    );
    if (reuse) return reuse.entry_id;
    // A revoked entry is terminal: new words about the same moment start a new entry.
    let id = `ent-${g.event.event_id}-${g.role}`;
    for (let n = 2; revokedIds.has(id); n++) id = `ent-${g.event.event_id}-${g.role}-${n}`;
    return id;
  };

  const fresh: KnowledgeEntryContent[] = [];
  const current: KnowledgeEntryContent[] = [];
  const touched: { entry: KnowledgeEntryContent; prior: KnowledgeEntryContent; via: string[] }[] = [];

  for (const g of groupLines(m)) {
    const entryId = entryIdFor(g);
    const content = buildContent(g, entryId, exchanges, input.resolve_image_ref);
    const prior = latestById.get(entryId);
    if (prior && contentHash(prior) === contentHash(content)) {
      current.push(prior);
      continue;
    }
    const entry = prior
      ? {
          ...content,
          revision_id: `rev-${revisionNo(prior.revision_id) + 1}`,
          parent_revision_id: prior.revision_id,
          change_reason: changeReason(prior, content, corrections),
        }
      : content;
    fresh.push(entry);
    current.push(entry);
    if (prior) {
      const via = supportExchangeIds(entry).filter(x => corrections.has(x) && !supportExchangeIds(prior).includes(x));
      if (via.length) touched.push({ entry, prior, via });
    }
  }

  // Workflow: logical order (steps, exceptions, guardrails, escalations); pointing order breaks ties.
  const timeOf = (e: KnowledgeEntryContent) => Math.min(...e.visual_evidence.map(v => v.session_time_ms ?? Infinity));
  current.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || timeOf(a) - timeOf(b) || a.entry_id.localeCompare(b.entry_id));
  const ordered = current.map((e, i) => (fresh.includes(e) ? Object.assign(e, { workflow_position: i + 1 }) : e));

  for (const e of fresh) {
    const v = validateEntry(e, { exchanges: m.exchanges, events: [...m.events.values()] });
    if (!v.ok) {
      throw new Error(`synthesis produced an invalid entry ${e.entry_id}@${e.revision_id}: ${v.violations.map(x => `${x.code} at ${x.path}`).join("; ")}`);
    }
  }

  const flags: ReconfirmationFlag[] = [];
  const currentIds = new Set(current.map(e => e.entry_id));
  for (const t of touched) {
    const events = new Set(eventIdsOf(t.prior));
    const support = new Set(supportExchangeIds(t.prior));
    for (const other of current) {
      if (other.entry_id === t.entry.entry_id || fresh.includes(other)) continue;
      const shared = [...eventIdsOf(other).filter(x => events.has(x)), ...supportExchangeIds(other).filter(x => support.has(x))];
      if (!shared.length || flags.some(f => f.entry_id === other.entry_id)) continue;
      flags.push({
        entry_id: other.entry_id,
        revision_id: other.revision_id,
        reason: `shares ${[...new Set(shared)].join(", ")} with ${t.entry.entry_id}, corrected in ${t.via.join(", ")}`,
      });
    }
  }
  for (const e of latest) {
    if (e.status !== "revoked" && !currentIds.has(e.entry_id)) {
      flags.push({ entry_id: e.entry_id, revision_id: e.revision_id, reason: "no on-record expert words support it any more" });
    }
  }
  flags.sort((a, b) => a.entry_id.localeCompare(b.entry_id));

  const workflow: WorkflowDoc = {
    produced_by: { ...SYNTHESIS_MODULE },
    steps: ordered.map((e, i) => ({
      position: i + 1,
      entry_id: e.entry_id,
      revision_id: e.revision_id,
      kind: e.kind,
      status: e.status,
      title: `${KIND_LABEL[e.kind]} at ${eventIdsOf(e).join(", ")}`,
      event_ids: eventIdsOf(e),
    })),
    timeline: timeline(m, eventsAll),
  };

  return {
    entries: fresh,
    workflow,
    gaps: findGaps({ ...input, entries: ordered }),
    teach_back: buildTeachBack(ordered),
    flagged_for_reconfirmation: flags,
  };
}

function timeline(m: Material, events: ReadonlyMap<string, PointingEvent>): WorkflowDoc["timeline"] {
  const byEvent = new Map<string, Set<string>>();
  for (const l of m.lines) {
    const ids = byEvent.get(l.event_id) ?? new Set<string>();
    ids.add(l.exchange_id);
    byEvent.set(l.event_id, ids);
  }
  return [...byEvent.entries()]
    .map(([event_id, ids]) => ({ event_id, session_time_ms: events.get(event_id)?.session_time_ms ?? 0, exchange_ids: [...ids] }))
    .sort((a, b) => a.session_time_ms - b.session_time_ms || a.event_id.localeCompare(b.event_id));
}

/** knowledge/workflow.md. Links are relative to the workflow file: `<entries_dir>/<id>/<rev>.md`. */
export function renderWorkflowMarkdown(doc: WorkflowDoc, opts: { entries_dir?: string } = {}): string {
  const dir = opts.entries_dir ?? "entries";
  return [
    "# Workflow",
    "",
    `> Generated by ${doc.produced_by.module} ${doc.produced_by.version}. Order and titles are AI synthesis; the expert's words and images are in each linked entry.`,
    "",
    ...(doc.steps.length
      ? doc.steps.map(
          s => `${s.position}. **${s.title}** — [\`${s.entry_id}\` · ${s.revision_id}](<${dir}/${s.entry_id}/${s.revision_id}.md>) · ${s.status}`
        )
      : ["_No steps yet._"]),
    "",
    "## Session timeline (recording order, secondary)",
    "",
    ...(doc.timeline.length
      ? doc.timeline.map(t => `- \`${t.event_id}\` at ${(t.session_time_ms / 1000).toFixed(1)} s session time: ${t.exchange_ids.map(x => `\`${x}\``).join(", ")}`)
      : ["_none_"]),
    "",
    "Session time is when the expert pointed, not a position on the trace.",
    "",
  ].join("\n");
}
