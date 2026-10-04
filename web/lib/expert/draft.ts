// Draft revisions of the workflow: evidence checks, the verbatim-quote rule, stable step
// ids across revisions, and per-step verification. Pure. The client is the only authority
// for revision ids and evidence links, whoever wrote the step text.

import {
  type CoverageItem,
  type DraftRevision,
  type DraftStep,
  type ExpertConfirmation,
  type ExpertExchange,
  type PointingEvent,
  type ProposeDraftParams,
  type ProposedStep,
  type SessionSnapshot,
  type StepKind,
  type Topic,
} from "./contracts";
import { gapDescription } from "./coverage";

export type DraftContext = Pick<SessionSnapshot, "session_id" | "events" | "exchanges" | "topics" | "coverage" | "revisions">;

export type BuildOptions = {
  parent: DraftRevision | null;
  at_utc: string;
  change_reason: string | null;
  change_exchange_ids: string[];
};

export type BuildResult = { ok: true; revision: DraftRevision; unsupported: DraftStep[] } | { ok: false; errors: string[] };

const QUOTE_PATTERNS = [/"([^"]+)"/g, /“([^”]+)”/g, /‘([^’]+)’/g, /(?<![\p{L}\p{N}])'([^']+?)'(?![\p{L}\p{N}])/gu];

/** Quoted spans in order of appearance. Apostrophes inside words ("don't") are not quotes. */
export function quotedSpans(text: string): string[] {
  const found: { at: number; span: string }[] = [];
  for (const re of QUOTE_PATTERNS) {
    for (const m of text.matchAll(re)) found.push({ at: m.index ?? 0, span: m[1].trim() });
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.span).filter(Boolean);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?…-]+|[\s.,;:!?…-]+$/g, "");

/** Quotes in `text` that do not appear verbatim in any of `answerLines` (case, spacing and edge punctuation aside). */
export function checkQuotes(text: string, answerLines: string[]): string[] {
  const lines = answerLines.map(normalize);
  const joined = lines.join(" ");
  return quotedSpans(text).filter(q => {
    const n = normalize(q);
    return !n || !(lines.some(l => l.includes(n)) || joined.includes(n));
  });
}

/** Expert words that can support a step: answered, and not a region-only clarification. */
const isEvidence = (x: ExpertExchange) => x.answer_lines.length > 0 && x.kind !== "clarify_reference";

const sameStep = (a: { kind: StepKind; text: string }, b: { kind: StepKind; text: string }) =>
  a.kind === b.kind && normalize(a.text) === normalize(b.text);

const stepNumber = (id: string) => Number(/^s-(\d+)$/.exec(id)?.[1] ?? 0);

/**
 * Turns a proposal into the next immutable revision. Unknown ids and non-verbatim quotes
 * reject the whole proposal. A step lacking event or exchange evidence is kept but flagged
 * `supported: false`. Anything the expert said is unknown / to escalate gets a guardrail step.
 */
export function buildRevision(ctx: DraftContext, proposal: ProposeDraftParams, opts: BuildOptions): BuildResult {
  const errors: string[] = [];
  const eventIds = new Set(ctx.events.map(e => e.event_id));
  const byId = new Map(ctx.exchanges.map(x => [x.exchange_id, x]));

  const steps: Omit<DraftStep, "step_id">[] = proposal.steps.map((p, i) => {
    for (const e of p.event_ids) if (!eventIds.has(e)) errors.push(`steps[${i}]: unknown event_id ${e}`);
    for (const x of p.exchange_ids) if (!byId.has(x)) errors.push(`steps[${i}]: unknown exchange_id ${x}`);
    const exchanges = p.exchange_ids.map(id => byId.get(id)).filter((x): x is ExpertExchange => x !== undefined);
    const evidence = exchanges.filter(isEvidence);
    const bad = checkQuotes(p.text, evidence.flatMap(x => x.answer_lines.map(l => l.text)));
    for (const q of bad) errors.push(`steps[${i}]: quote not verbatim in its linked answers: "${q}"`);
    // an exchange is linked to its event (and merged duplicates), so that link is evidence too
    const events = unique([...p.event_ids, ...evidence.flatMap(x => (x.event_id ? [x.event_id, ...x.related_event_ids] : []))]);
    return {
      kind: p.kind,
      text: p.text,
      supporting_event_ids: events.filter(e => eventIds.has(e)),
      supporting_exchange_ids: unique(p.exchange_ids.filter(x => byId.has(x))),
      supported: evidence.length > 0 && events.some(e => eventIds.has(e)),
    };
  });
  if (errors.length) return { ok: false, errors };

  for (const item of ctx.coverage.filter(c => c.resolution === "unknown_escalate")) {
    const covered = steps.some(s => s.kind === "guardrail" && s.supporting_exchange_ids.some(x => item.supporting_exchange_ids.includes(x)));
    if (!covered) {
      const step = escalationStep(item, ctx);
      if (step) steps.push(step);
    }
  }

  let next = Math.max(0, ...ctx.revisions.flatMap(r => r.steps.map(s => stepNumber(s.step_id))));
  const parentSteps = opts.parent?.steps ?? [];
  const withIds: DraftStep[] = steps.map(s => {
    const kept = parentSteps.find(p => sameStep(p, s));
    return { step_id: kept ? kept.step_id : `s-${++next}`, ...s };
  });

  const revision: DraftRevision = {
    revision_id: `rev-${ctx.revisions.length + 1}`,
    session_id: ctx.session_id,
    created_at_utc: opts.at_utc,
    parent_revision_id: opts.parent?.revision_id ?? null,
    steps: withIds,
    change_reason: opts.change_reason,
    change_exchange_ids: [...opts.change_exchange_ids],
  };
  return { ok: true, revision, unsupported: withIds.filter(s => !s.supported) };
}

function escalationStep(item: CoverageItem, ctx: DraftContext): Omit<DraftStep, "step_id"> | null {
  const exchanges = item.supporting_exchange_ids
    .map(id => ctx.exchanges.find(x => x.exchange_id === id))
    .filter((x): x is ExpertExchange => x !== undefined && isEvidence(x));
  const source = exchanges.at(-1);
  if (!source) return null;
  const topic = ctx.topics.find(t => t.primary_event_id === item.event_id);
  const line = source.answer_lines[0].text.trim();
  const events = unique([...(item.event_id ? [item.event_id] : []), ...(source.event_id ? [source.event_id, ...source.related_event_ids] : [])]);
  return {
    kind: "guardrail",
    text: `Stop and escalate here; the expert does not know this one: ${gapDescription(item.dimension, topic)} The expert said: "${line}"`,
    supporting_event_ids: events,
    supporting_exchange_ids: [source.exchange_id],
    supported: events.length > 0,
  };
}

const STEP_KIND_OF: Partial<Record<ExpertExchange["kind"], StepKind>> = { guardrail: "guardrail", exception: "exception" };

/**
 * Deterministic stand-in when the agent has not proposed a draft (console button, tests):
 * one step per answered, event-linked exchange, quoting the expert's first line verbatim.
 * Not process-shaped; the agent's `propose_draft` is the normal path.
 */
export function fallbackProposal(ctx: Pick<DraftContext, "exchanges" | "topics" | "events">): ProposeDraftParams {
  const steps: ProposedStep[] = [];
  for (const x of ctx.exchanges) {
    if (!isEvidence(x) || x.event_id === null || x.kind === "teach_back" || x.kind === "correction") continue;
    const topic: Topic | undefined = ctx.topics.find(t => t.primary_event_id === x.event_id);
    const event: PointingEvent | undefined = ctx.events.find(e => e.event_id === x.event_id);
    const where = `the region pointed at on ${topic?.channel_id ?? event?.channel_id ?? "the trace"}`;
    const kind = STEP_KIND_OF[x.kind] ?? "step";
    const lead = kind === "guardrail" ? "Guardrail for" : kind === "exception" ? "Exception for" : "At";
    steps.push({ kind, text: `${lead} ${where}, the expert said: "${x.answer_lines[0].text.trim()}"`, event_ids: [x.event_id], exchange_ids: [x.exchange_id] });
  }
  return { steps, change_reason: null };
}

export function diffRevisions(parent: DraftRevision | null, child: DraftRevision): { added: string[]; removed: string[]; unchanged: string[] } {
  const before = new Set(parent?.steps.map(s => s.step_id) ?? []);
  const after = new Set(child.steps.map(s => s.step_id));
  return {
    added: child.steps.filter(s => !before.has(s.step_id)).map(s => s.step_id),
    removed: (parent?.steps ?? []).filter(s => !after.has(s.step_id)).map(s => s.step_id),
    unchanged: child.steps.filter(s => before.has(s.step_id)).map(s => s.step_id),
  };
}

/** Steps the teach-back must cover: all supported steps of rev-1, only new or changed ones after a correction. */
export function stepsToTeach(revision: DraftRevision, parent: DraftRevision | null): DraftStep[] {
  const added = new Set(diffRevisions(parent, revision).added);
  return revision.steps.filter(s => s.supported && added.has(s.step_id));
}

/** Appends a revision. Existing revisions are frozen and can never be replaced. */
export function addRevision(revisions: DraftRevision[], revision: DraftRevision): DraftRevision[] {
  if (revisions.some(r => r.revision_id === revision.revision_id)) {
    throw new Error(`revision ${revision.revision_id} already exists; revisions are immutable`);
  }
  return [...revisions, deepFreeze(revision)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export type StepStatus = "confirmed" | "unresolved";

/**
 * Verification per step of the latest revision. Confirmed only when the latest revision has a
 * `confirmed` confirmation and some confirmation in its ancestor chain reviewed that step id
 * (unchanged steps keep their ids, so an earlier review carries over). Unsupported steps never.
 */
export function stepVerification(revisions: DraftRevision[], confirmations: ExpertConfirmation[]): Record<string, StepStatus> {
  const latest = revisions.at(-1);
  if (!latest) return {};
  const chain = new Set<string>();
  for (let r: DraftRevision | undefined = latest; r; r = revisions.find(p => p.revision_id === r!.parent_revision_id)) {
    chain.add(r.revision_id);
  }
  const confirmedLatest = confirmations.some(c => c.revision_id === latest.revision_id && c.status === "confirmed");
  const reviewed = new Set(
    confirmations.filter(c => chain.has(c.revision_id) && c.status !== "unresolved").flatMap(c => c.step_ids_reviewed)
  );
  return Object.fromEntries(
    latest.steps.map(s => [s.step_id, confirmedLatest && s.supported && reviewed.has(s.step_id) ? "confirmed" : "unresolved"])
  );
}

const unique = <T,>(list: T[]) => [...new Set(list)];
