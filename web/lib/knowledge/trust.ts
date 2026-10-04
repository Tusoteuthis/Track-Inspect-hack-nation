// Trust propagation (brief §10, Sprint 4 Lane D). Pure checks WS6 runs when knowledge changes:
// - checkPinnedKnowledge: is a newcomer session's pinned knowledge still teachable? If not, WS6
//   reports `knowledge_changed` (evaluations → stale, commit blocked) and re-pins.
// - flagDependents: which other revisions lean on revoked or deleted evidence and need the
//   expert's re-confirmation. Flags are advisory; deleted evidence already makes a revision
//   ineligible (its links no longer resolve), shared evidence does not by itself.

import { isTeachable, type EligibilityContext, type IneligibleReason, type KnowledgeCandidate } from "./eligibility";
import { collectQuotes, type KnowledgeEntryContent } from "./schema";

export type EntryRef = { entry_id: string; revision_id: string };

export type PinCheck =
  | { status: "current" }
  | { status: "knowledge_changed"; changed: (EntryRef & { reason: IneligibleReason | "missing"; detail: string })[] };

/** Re-check every pinned revision against the current store. Never trust a cached pin. */
export function checkPinnedKnowledge(pinned: readonly EntryRef[], candidates: readonly KnowledgeCandidate[], ctx: EligibilityContext): PinCheck {
  const changed: Extract<PinCheck, { status: "knowledge_changed" }>["changed"] = [];
  for (const ref of pinned) {
    const candidate = candidates.find(c => c.entry?.entry_id === ref.entry_id && c.entry?.revision_id === ref.revision_id);
    if (!candidate) {
      changed.push({ ...ref, reason: "missing", detail: "revision not in the store" });
      continue;
    }
    const t = isTeachable(candidate, ctx);
    if (!t.ok) changed.push({ ...ref, reason: t.reason, detail: t.detail });
  }
  return changed.length ? { status: "knowledge_changed", changed } : { status: "current" };
}

export type DependentFlag = EntryRef & {
  reason: "shares_exchange" | "shares_event" | "evidence_deleted";
  /** The exchange or event ids that link it to the removed material. */
  via: string[];
};

function exchangeIds(e: KnowledgeEntryContent): Set<string> {
  const ids = new Set(collectQuotes(e).map(q => q.exchange_id));
  if (e.confirmation) ids.add(e.confirmation.expert_response_exchange_id);
  return ids;
}
const eventIds = (e: KnowledgeEntryContent) => new Set(e.visual_evidence.map(v => v.event_id));
const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();

/**
 * Revisions that depend on revoked entries (shared expert words or the same screen moment) or on
 * deleted exchanges/events. One flag per revision; deleted evidence outranks a shared exchange,
 * which outranks a shared event. Revoked revisions themselves are not flagged.
 */
export function flagDependents(input: {
  candidates: readonly KnowledgeCandidate[];
  revoked: readonly EntryRef[];
  deleted_exchange_ids?: readonly string[];
  deleted_event_ids?: readonly string[];
  /** When given, only current revisions are flagged (older ones never teach anyway). */
  current_revision_by_entry?: Readonly<Record<string, string>>;
}): DependentFlag[] {
  const entries = input.candidates.map(c => c.entry);
  const isRevoked = (e: KnowledgeEntryContent) =>
    e.status === "revoked" || input.revoked.some(r => r.entry_id === e.entry_id && r.revision_id === e.revision_id);
  const revokedEntries = entries.filter(e => input.revoked.some(r => r.entry_id === e.entry_id && r.revision_id === e.revision_id));
  const revokedExchanges = new Set(revokedEntries.flatMap(e => [...exchangeIds(e)].filter(id => id !== e.confirmation?.expert_response_exchange_id)));
  const revokedEvents = new Set(revokedEntries.flatMap(e => [...eventIds(e)]));
  const deletedExchanges = new Set(input.deleted_exchange_ids ?? []);
  const deletedEvents = new Set(input.deleted_event_ids ?? []);

  const flags: DependentFlag[] = [];
  for (const e of entries) {
    if (isRevoked(e)) continue;
    if (input.current_revision_by_entry && input.current_revision_by_entry[e.entry_id] !== e.revision_id) continue;
    const xs = exchangeIds(e);
    const evs = eventIds(e);
    const deleted = sorted([...xs].filter(id => deletedExchanges.has(id)).concat([...evs].filter(id => deletedEvents.has(id))));
    const sharedX = sorted([...xs].filter(id => revokedExchanges.has(id)));
    const sharedE = sorted([...evs].filter(id => revokedEvents.has(id)));
    const ref = { entry_id: e.entry_id, revision_id: e.revision_id };
    if (deleted.length) flags.push({ ...ref, reason: "evidence_deleted", via: deleted });
    else if (sharedX.length) flags.push({ ...ref, reason: "shares_exchange", via: sharedX });
    else if (sharedE.length) flags.push({ ...ref, reason: "shares_event", via: sharedE });
  }
  return flags;
}
