// Which knowledge may teach. Only confirmed, current, non-revoked, valid revisions whose
// linked evidence is on-record reach the tutor. Everything else is excluded with a reason.

import type { ExpertExchange, PointingEvent } from "@/lib/expert/contracts";
import { collectQuotes, validateEntry, type KnowledgeEntryContent } from "./schema";

export type IneligibleReason =
  | "not_knowledge"
  | "invalid"
  | "revoked"
  | "not_confirmed"
  | "superseded"
  | "off_record_evidence"
  | "fixture_not_allowed";

/** Checked in this order; the first failing check is the reason returned. */
export const ELIGIBILITY_ORDER: readonly IneligibleReason[] = [
  "not_knowledge",
  "invalid",
  "revoked",
  "not_confirmed",
  "superseded",
  "off_record_evidence",
  "fixture_not_allowed",
];

/** A stored record offered for teaching. `path` is where it was read from, if from disk. */
export type KnowledgeCandidate = {
  record_type: string;
  path: string | null;
  entry: KnowledgeEntryContent;
};

export type EligibilityContext = {
  /** entry_id → the entry's current revision_id (WS6 `current.json`). */
  current_revision_by_entry: Readonly<Record<string, string>>;
  exchanges: readonly ExpertExchange[];
  events: readonly PointingEvent[];
  allow_fixture: boolean;
};

export type Teachability = { ok: true } | { ok: false; reason: IneligibleReason; detail: string };

// <anything>/entries/<entry_id>/rev-<n>.(md|json). Assessments, learner records, evaluator notes
// and runtime files never qualify, even if someone nests an "entries" folder inside them.
const ENTRY_PATH = /(?:^|\/)entries\/([a-z0-9][a-z0-9-]{0,63})\/(rev-\d+)\.(?:md|json)$/;
const FORBIDDEN_SEGMENT = /(?:^|\/)(?:assessments|learner|evaluator|\.runtime|sessions)(?:\/|$)/;

function notKnowledge(c: KnowledgeCandidate): string | null {
  if (c.record_type !== "knowledge_entry") return `record type "${c.record_type}" is not a knowledge entry`;
  if (c.path === null) return null;
  if (FORBIDDEN_SEGMENT.test(c.path)) return `path ${c.path} is outside knowledge entries`;
  const m = ENTRY_PATH.exec(c.path);
  if (!m) return `path ${c.path} is not entries/<entry_id>/rev-<n>`;
  if (m[1] !== c.entry?.entry_id || m[2] !== c.entry?.revision_id) {
    return `path ${c.path} does not match ${c.entry?.entry_id}/${c.entry?.revision_id}`;
  }
  return null;
}

function linkedExchangeIds(entry: KnowledgeEntryContent): Set<string> {
  const ids = new Set(collectQuotes(entry).map(q => q.exchange_id));
  if (entry.confirmation) ids.add(entry.confirmation.expert_response_exchange_id);
  return ids;
}

function linkedRecords(entry: KnowledgeEntryContent, ctx: EligibilityContext) {
  const exchangeIds = linkedExchangeIds(entry);
  const exchanges = ctx.exchanges.filter(x => exchangeIds.has(x.exchange_id));
  // An exchange's own event counts as evidence too: words about an off-record gesture are off-record.
  const eventIds = new Set([
    ...entry.visual_evidence.map(v => v.event_id),
    ...exchanges.flatMap(x => (x.event_id ? [x.event_id] : [])),
  ]);
  const events = ctx.events.filter(e => eventIds.has(e.event_id));
  return { exchanges, events };
}

const fail = (reason: IneligibleReason, detail: string): Teachability => ({ ok: false, reason, detail });

export function isTeachable(candidate: KnowledgeCandidate, ctx: EligibilityContext): Teachability {
  const outside = notKnowledge(candidate);
  if (outside) return fail("not_knowledge", outside);

  // Unknown links fail closed here: validation with the context flags missing exchanges/events.
  const validation = validateEntry(candidate.entry, { exchanges: ctx.exchanges, events: ctx.events });
  if (!validation.ok) {
    return fail("invalid", validation.violations.map(v => `${v.code} at ${v.path || "entry"}`).join("; "));
  }
  const entry = validation.value;

  if (entry.status === "revoked") return fail("revoked", entry.revoked_reason ?? "revoked");
  if (entry.status !== "confirmed") return fail("not_confirmed", `status is ${entry.status}`);

  const current = ctx.current_revision_by_entry[entry.entry_id];
  if (current !== entry.revision_id) {
    return fail("superseded", current ? `current revision is ${current}` : "entry has no current revision");
  }

  const linked = linkedRecords(entry, ctx);
  const offRecord = [
    ...linked.exchanges.filter(x => x.record_state !== "on_record").map(x => x.exchange_id),
    ...linked.events.filter(e => e.record_state !== "on_record").map(e => e.event_id),
  ];
  if (offRecord.length) return fail("off_record_evidence", `off-record evidence: ${offRecord.join(", ")}`);

  if (!ctx.allow_fixture) {
    const fixtures = [
      ...(entry.source === "fixture" ? [entry.entry_id] : []),
      ...linked.exchanges.filter(x => x.source === "fixture").map(x => x.exchange_id),
      ...linked.events.filter(e => e.source === "fixture").map(e => e.event_id),
    ];
    if (fixtures.length) return fail("fixture_not_allowed", `fixture material: ${fixtures.join(", ")}`);
  }
  return { ok: true };
}

export type ExcludedRevision = {
  entry_id: string | null;
  revision_id: string | null;
  path: string | null;
  reason: IneligibleReason;
  detail: string;
};

export type PinnedKnowledge = {
  /** Teachable revisions, ordered by workflow_position (unknown last), then entry_id. */
  pinned: readonly KnowledgeEntryContent[];
  excluded: readonly ExcludedRevision[];
};

// Entries that went through selectEligible. retrieve() refuses anything else, so a caller
// cannot bypass eligibility by handing it raw revisions.
const pinnedByEligibility = new WeakSet<KnowledgeEntryContent>();

export function wasPinnedByEligibility(entry: KnowledgeEntryContent): boolean {
  return pinnedByEligibility.has(entry);
}

const byWorkflowOrder = (a: KnowledgeEntryContent, b: KnowledgeEntryContent) =>
  (a.workflow_position ?? Number.POSITIVE_INFINITY) - (b.workflow_position ?? Number.POSITIVE_INFINITY) ||
  a.entry_id.localeCompare(b.entry_id);

/**
 * The knowledge pinned for one newcomer session. Stable signature: WS6 calls this instead of its
 * stub. Re-run it whenever entries, confirmations or revocations change; never cache the result
 * across those changes.
 */
export function selectEligible(candidates: readonly KnowledgeCandidate[], ctx: EligibilityContext): PinnedKnowledge {
  const pinned: KnowledgeEntryContent[] = [];
  const excluded: ExcludedRevision[] = [];
  for (const c of candidates) {
    const result = isTeachable(c, ctx);
    if (result.ok) {
      // A frozen copy: later edits to the stored record cannot leak into the pinned set.
      const copy = deepFreeze(structuredClone(c.entry));
      pinnedByEligibility.add(copy);
      pinned.push(copy);
    } else {
      excluded.push({
        entry_id: typeof c.entry?.entry_id === "string" ? c.entry.entry_id : null,
        revision_id: typeof c.entry?.revision_id === "string" ? c.entry.revision_id : null,
        path: c.path,
        reason: result.reason,
        detail: result.detail,
      });
    }
  }
  return { pinned: pinned.sort(byWorkflowOrder), excluded };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
