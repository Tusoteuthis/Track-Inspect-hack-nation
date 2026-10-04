// The material synthesis and gap finding work from: on-record exchanges and events only, each
// answer line classified into the roles it supports. Off-record material and the exact words of
// revoked entries are removed here, before anything else sees them.

import type { ExpertConfirmation, ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import { cueRoles, type CueRole } from "./cues";
import { collectQuotes, type EntryKind, type KnowledgeEntryContent } from "./schema";
import type { GapAnswer, GapKind } from "./synthesis-types";

/** "step" covers both step and decision; the kind is chosen once the support is known. */
export type Role = "step" | CueRole;
export const ROLE_ORDER: readonly Role[] = ["step", "exception", "guardrail", "escalation"];

/** Where a line goes inside its entry. */
export type LineUse = "interpretation" | "reasoning" | "rule";

export type ClassifiedLine = {
  exchange_id: string;
  line_index: number;
  text: string;
  event_id: string;
  role: Role;
  use: LineUse;
};

export type Material = {
  /** On-record events, by id. */
  events: ReadonlyMap<string, PointingEvent>;
  /** On-record exchanges that may support knowledge, in asked order. */
  exchanges: readonly ExpertExchange[];
  lines: readonly ClassifiedLine[];
  /** Answered exchanges whose words cannot be tied to a screen moment. */
  unlinked: readonly ExpertExchange[];
  /** Corrections that cannot be tied to one entry. */
  unlocated_corrections: readonly { confirmation: ExpertConfirmation; reason: string }[];
  /** Events whose ambiguous reference the expert clarified. */
  clarified_event_ids: ReadonlySet<string>;
  /** gap_id → exchange that answered it. */
  answered_gaps: ReadonlyMap<string, string>;
};

export type MaterialInput = {
  events: readonly PointingEvent[];
  exchanges: readonly ExpertExchange[];
  confirmations: readonly ExpertConfirmation[];
  prior: readonly KnowledgeEntryContent[];
  gap_answers?: readonly GapAnswer[];
};

const answered = (x: ExpertExchange) => x.answer_lines.some(l => l.text.trim().length > 0);

export const gapKindOf = (gapId: string): GapKind | null => {
  const m = /^gap-(missing_reason|unclear_guardrail|conflict|unqualified_exception|missing_evidence|ambiguous_reference)-/.exec(gapId);
  return m ? (m[1] as GapKind) : null;
};

export function roleOfKind(kind: EntryKind): Role {
  return kind === "step" || kind === "decision" ? "step" : kind;
}

const revisionNo = (revisionId: string) => Number(/^rev-(\d+)$/.exec(revisionId)?.[1] ?? 0);

/** The latest revision per entry: highest rev-<n>, ties broken by revision id. */
export function latestRevisions(prior: readonly KnowledgeEntryContent[]): KnowledgeEntryContent[] {
  const byEntry = new Map<string, KnowledgeEntryContent>();
  for (const e of prior) {
    const seen = byEntry.get(e.entry_id);
    if (!seen || revisionNo(e.revision_id) > revisionNo(seen.revision_id)) byEntry.set(e.entry_id, e);
  }
  return [...byEntry.values()].sort((a, b) => a.entry_id.localeCompare(b.entry_id));
}

function baseUses(x: ExpertExchange, gapKind: GapKind | null): { role: Role; use: LineUse }[] {
  switch (x.kind) {
    case "explain":
    case "context":
    case "distinction":
      return [{ role: "step", use: "interpretation" }];
    case "reasoning":
      return [{ role: "step", use: "reasoning" }];
    case "guardrail":
      return [{ role: "guardrail", use: "rule" }];
    case "exception":
      return [{ role: "exception", use: "rule" }];
    case "gap":
      if (gapKind === "unclear_guardrail") return [{ role: "guardrail", use: "rule" }];
      if (gapKind === "unqualified_exception") return [{ role: "exception", use: "rule" }];
      return [];
    case "clarify_reference":
    case "teach_back":
    case "correction":
      return [];
  }
}

/** Roles of one line: its exchange kind plus linguistic cues. Many-to-many by design. */
function lineUses(x: ExpertExchange, text: string, gapKind: GapKind | null): { role: Role; use: LineUse }[] {
  const cues = cueRoles(text);
  let uses = baseUses(x, gapKind);
  if (cues.includes("escalation")) uses = uses.filter(u => u.role !== "guardrail");
  for (const role of cues) {
    if (!uses.some(u => u.role === role)) uses.push({ role, use: "rule" });
  }
  // A debrief answer with no cue and no specific gap fills in the reason for its moment.
  if (!uses.length && x.kind === "gap") uses.push({ role: "step", use: "reasoning" });
  return uses;
}

export function prepareMaterial(input: MaterialInput): Material {
  const events = new Map(input.events.filter(e => e.record_state === "on_record").map(e => [e.event_id, e]));
  const offRecordEvents = new Set(input.events.filter(e => e.record_state !== "on_record").map(e => e.event_id));
  const latest = latestRevisions(input.prior);

  // Words of a revoked entry never come back through synthesis.
  const revokedQuotes = latest
    .filter(e => e.status === "revoked")
    .flatMap(e => collectQuotes(e).map(q => ({ exchange_id: q.exchange_id, quote: q.quote })));
  const isRevoked = (exchangeId: string, text: string) =>
    revokedQuotes.some(q => q.exchange_id === exchangeId && (text.includes(q.quote) || q.quote.includes(text)));

  const corrections = new Map(
    input.confirmations.filter(c => c.status === "corrected").map(c => [c.expert_response_exchange_id, c])
  );
  const gapByExchange = new Map((input.gap_answers ?? []).map(a => [a.exchange_id, a.gap_id]));

  const onRecord = input.exchanges
    .filter(x => x.record_state === "on_record" && !(x.event_id && offRecordEvents.has(x.event_id)))
    // Teach-back replies only count when they correct something; a "yes" is not knowledge.
    .filter(x => x.phase !== "teach_back" || corrections.has(x.exchange_id))
    .slice()
    .sort((a, b) => a.asked_at_utc.localeCompare(b.asked_at_utc) || a.exchange_id.localeCompare(b.exchange_id));

  const lines: ClassifiedLine[] = [];
  const unlinked: ExpertExchange[] = [];
  const unlocated: { confirmation: ExpertConfirmation; reason: string }[] = [];
  const clarified = new Set<string>();
  const answeredGaps = new Map<string, string>();

  for (const x of onRecord) {
    if (!answered(x)) continue;
    const gapId = gapByExchange.get(x.exchange_id) ?? null;
    const gapKind = gapId ? gapKindOf(gapId) : null;
    if (gapId) answeredGaps.set(gapId, x.exchange_id);

    const correction = corrections.get(x.exchange_id);
    let target: { event_id: string; role: Role } | null = null;
    if (correction && !x.event_id) {
      // A spoken correction usually has no gesture: tie it to the one reviewed entry, if there is one.
      const reviewed = latest.filter(e => correction.step_ids_reviewed.includes(e.entry_id) && e.visual_evidence.length);
      if (reviewed.length !== 1) {
        unlocated.push({
          confirmation: correction,
          reason: reviewed.length ? `it reviewed ${reviewed.length} entries` : "no reviewed entry is known",
        });
        continue;
      }
      target = { event_id: reviewed[0].visual_evidence[0].event_id, role: roleOfKind(reviewed[0].kind) };
    }

    const eventId = target?.event_id ?? x.event_id;
    if (x.kind === "clarify_reference" || gapKind === "ambiguous_reference") {
      if (eventId) clarified.add(eventId);
      continue;
    }
    if (!eventId || !events.has(eventId)) {
      if (correction) unlocated.push({ confirmation: correction, reason: "its exchange has no known screen moment" });
      else unlinked.push(x);
      continue;
    }

    x.answer_lines.forEach((line, line_index) => {
      if (!line.text.trim() || isRevoked(x.exchange_id, line.text)) return;
      const uses = target ? [{ role: target.role, use: "interpretation" as const }] : lineUses(x, line.text, gapKind);
      for (const u of uses) {
        lines.push({ exchange_id: x.exchange_id, line_index, text: line.text, event_id: eventId, ...u });
      }
    });
  }

  return {
    events,
    exchanges: onRecord,
    lines,
    unlinked,
    unlocated_corrections: unlocated,
    clarified_event_ids: clarified,
    answered_gaps: answeredGaps,
  };
}
