/**
 * Correction, deletion, revocation and off-record purge (S4).
 *
 * `computeCascade` is a pure function over the stored links:
 *   session → its assets, events, exchanges (and a newcomer's learner records)
 *   asset ↔ events that show it → exchanges about those events
 *   deleted/trimmed evidence → knowledge revisions citing it (or confirmed by a deleted answer)
 *   revoked revisions → newcomer sessions pinning them → their evaluations (→ stale)
 * `applyCascade` then writes tombstones first (so late retries can never recreate anything),
 * bumps each affected session's generation (running jobs discard their result), removes files,
 * revokes and redacts revisions, invalidates evaluations and emits SSE. Every step is idempotent,
 * so re-running an interrupted deletion completes it.
 */
import path from "node:path";
import type { CascadeSummary, ExchangePut, RecordStateRequest, Session } from "@/lib/contracts";
import { nextStatus } from "@/lib/knowledge";
import { loadAssetMeta } from "./assets";
import { appendBus } from "./bus";
import { listConfirmations } from "./confirmations";
import { diag } from "./diag";
import { ApiError } from "./errors";
import { listEvents } from "./events";
import { listExchanges } from "./exchanges";
import { assertSafeId, isValidId } from "./ids";
import {
  appendStatusTransition,
  listAllRevisions,
  loadEntry,
  readRevision,
  readStatusLog,
  redactRevisionFile,
  revisionStatus,
  withKnowledgeLock,
} from "./knowledge";
import { invalidateEvaluationsLocked } from "./learner";
import { listEvaluations } from "./learner-store";
import { withLock } from "./locks";
import { isOffRecordAt } from "./off-record";
import { assessmentsDir, assetDir, imagesRoot, learnerDir, sessionDir, sessionRecordFile } from "./paths";
import { bumpGenerationLocked, changeRecordState, getSession, loadSession, withSessionLock } from "./sessions";
import { writeJsonAtomic } from "./store";
import { readTombstone, writeTombstone } from "./tombstones";
import { getBlobStore, listNames } from "./blobstore";

// --- pure -------------------------------------------------------------------------

export type CascadeGraph = {
  sessions: { session_id: string; role: Session["role"] }[];
  assets: { asset_id: string; session_id: string }[];
  events: { session_id: string; event_id: string; asset_id: string | null }[];
  exchanges: { session_id: string; exchange_id: string; event_id: string | null }[];
  revisions: {
    entry_id: string;
    revision_id: string;
    session_id: string | null;
    event_ids: string[];
    exchange_ids: string[];
    asset_ids: string[];
    revoked: boolean;
  }[];
  confirmations: { reviewed_revision_id: string; expert_response_exchange_id: string }[];
  /** Newcomer sessions and the revision IDs they pinned. */
  pins: { session_id: string; revision_ids: string[] }[];
  evaluations: { session_id: string; evaluation_id: string; knowledge_revision_ids: string[]; cited_revision_ids: string[]; status: string }[];
};

export type CascadeRoot =
  | { kind: "session"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "event"; id: string; session_id: string }
  | { kind: "exchange"; id: string; session_id: string }
  /** Kept its record but lost content (retroactive off-record): its citers are revoked. */
  | { kind: "trimmed_exchange"; id: string; session_id: string }
  | { kind: "revision"; id: string };

type Rec = { session_id: string; id: string };
export type CascadePlan = {
  sessions: string[];
  assets: string[];
  events: Rec[];
  exchanges: Rec[];
  trimmed_exchanges: Rec[];
  revisions: { entry_id: string; revision_id: string; session_id: string | null }[];
  /** Live evaluations (pending/done) using a revoked revision. */
  stale_evaluations: Rec[];
  /** Evaluations quoting a revoked revision (any status). */
  citing_evaluations: Rec[];
  /** Surviving sessions whose stored state changes (generation bump). */
  affected_sessions: string[];
};

const key = (sid: string | null, id: string) => `${sid ?? "-"}/${id}`;

export function computeCascade(graph: CascadeGraph, roots: readonly CascadeRoot[]): CascadePlan {
  const sessions = new Set(roots.flatMap(r => (r.kind === "session" ? [r.id] : [])));
  const assets = new Set(roots.flatMap(r => (r.kind === "asset" ? [r.id] : [])));
  const events = new Set(roots.flatMap(r => (r.kind === "event" ? [key(r.session_id, r.id)] : [])));
  const exchanges = new Set(roots.flatMap(r => (r.kind === "exchange" ? [key(r.session_id, r.id)] : [])));
  const trimmed = new Set(roots.flatMap(r => (r.kind === "trimmed_exchange" ? [key(r.session_id, r.id)] : [])));

  for (const a of graph.assets) if (sessions.has(a.session_id)) assets.add(a.asset_id);
  for (const e of graph.events) if (sessions.has(e.session_id)) events.add(key(e.session_id, e.event_id));
  // An event and the image it shows go together, in both directions, until nothing changes.
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of graph.events) {
      const k = key(e.session_id, e.event_id);
      if (!events.has(k) && e.asset_id && assets.has(e.asset_id)) (events.add(k), (changed = true));
      if (events.has(k) && e.asset_id && !assets.has(e.asset_id)) (assets.add(e.asset_id), (changed = true));
    }
  }
  for (const x of graph.exchanges) {
    const k = key(x.session_id, x.exchange_id);
    // Words about a deleted gesture go with it.
    if (sessions.has(x.session_id) || (x.event_id && events.has(key(x.session_id, x.event_id)))) exchanges.add(k);
  }
  for (const k of exchanges) trimmed.delete(k);

  const deletedResponse = new Set(
    graph.confirmations.filter(c => [...exchanges].some(k => k.endsWith(`/${c.expert_response_exchange_id}`))).map(c => c.reviewed_revision_id),
  );
  const revisionRoots = new Set(roots.flatMap(r => (r.kind === "revision" ? [r.id] : [])));
  const revisions = graph.revisions.filter(r => {
    if (revisionRoots.has(r.revision_id)) return true;
    if (r.revoked) return false;
    const sid = r.session_id;
    return (
      (sid !== null && sessions.has(sid)) ||
      r.event_ids.some(id => events.has(key(sid, id))) ||
      r.exchange_ids.some(id => exchanges.has(key(sid, id)) || trimmed.has(key(sid, id))) ||
      r.asset_ids.some(id => assets.has(id)) ||
      deletedResponse.has(r.revision_id)
    );
  });
  const revoked = new Set(revisions.map(r => r.revision_id));

  const alive = (sid: string) => !sessions.has(sid);
  const staleEvaluations = graph.evaluations.filter(
    e => alive(e.session_id) && (e.status === "pending" || e.status === "done") && e.knowledge_revision_ids.some(id => revoked.has(id)),
  );
  const citingEvaluations = graph.evaluations.filter(e => alive(e.session_id) && e.cited_revision_ids.some(id => revoked.has(id)));

  const split = (k: string): Rec => {
    const i = k.indexOf("/");
    return { session_id: k.slice(0, i), id: k.slice(i + 1) };
  };
  const ownerOf = new Map(graph.assets.map(a => [a.asset_id, a.session_id]));
  const affected = new Set<string>([
    ...[...events, ...exchanges, ...trimmed].map(k => split(k).session_id),
    ...[...assets].flatMap(a => (ownerOf.has(a) ? [ownerOf.get(a)!] : [])),
    ...revisions.flatMap(r => (r.session_id ? [r.session_id] : [])),
    ...graph.pins.filter(p => p.revision_ids.some(id => revoked.has(id))).map(p => p.session_id),
  ]);

  return {
    sessions: [...sessions].sort(),
    assets: [...assets].sort(),
    events: [...events].sort().map(split),
    exchanges: [...exchanges].sort().map(split),
    trimmed_exchanges: [...trimmed].sort().map(split),
    revisions: revisions.map(r => ({ entry_id: r.entry_id, revision_id: r.revision_id, session_id: r.session_id })),
    stale_evaluations: staleEvaluations.map(e => ({ session_id: e.session_id, id: e.evaluation_id })),
    citing_evaluations: citingEvaluations.map(e => ({ session_id: e.session_id, id: e.evaluation_id })),
    affected_sessions: [...affected].filter(alive).sort(),
  };
}

// --- graph from disk --------------------------------------------------------------

const sessionsRoot = () => path.dirname(sessionDir("x"));

async function listSessionIds(): Promise<string[]> {
  const names = await listNames(sessionsRoot()).catch(() => [] as string[]);
  return names.filter(isValidId).sort();
}

async function listAssetIds(): Promise<string[]> {
  const names = await listNames(imagesRoot()).catch(() => [] as string[]);
  return names.filter(isValidId).sort();
}

export async function loadCascadeGraph(): Promise<CascadeGraph> {
  const graph: CascadeGraph = { sessions: [], assets: [], events: [], exchanges: [], revisions: [], confirmations: [], pins: [], evaluations: [] };
  for (const sid of await listSessionIds()) {
    const s = await loadSession(sid).catch(() => null);
    if (!s) continue;
    graph.sessions.push({ session_id: sid, role: s.role });
    if (s.role === "newcomer") {
      graph.pins.push({ session_id: sid, revision_ids: (s.pinned_knowledge ?? []).map(p => p.revision_id) });
      for (const e of await listEvaluations(sid)) {
        graph.evaluations.push({
          session_id: sid,
          evaluation_id: e.evaluation_id,
          knowledge_revision_ids: e.knowledge_revision_ids,
          cited_revision_ids: [...e.cited.map(c => c.revision_id), ...(e.escalation ? [e.escalation.revision_id] : [])],
          status: e.status,
        });
      }
    }
    for (const e of await listEvents(sid).catch(() => [])) graph.events.push({ session_id: sid, event_id: e.event_id, asset_id: e.asset_id ?? null });
    for (const x of await listExchanges(sid).catch(() => [])) graph.exchanges.push({ session_id: sid, exchange_id: x.exchange_id, event_id: x.event_id });
  }
  for (const aid of await listAssetIds()) {
    const a = await loadAssetMeta(aid).catch(() => null);
    if (a) graph.assets.push({ asset_id: aid, session_id: a.session_id });
  }
  for (const r of await listAllRevisions()) {
    const log = await readStatusLog(r.entry_id);
    graph.revisions.push({
      entry_id: r.entry_id,
      revision_id: r.revision_id,
      session_id: r.session_id ?? null,
      ...r.evidence,
      revoked: (await revisionStatus(r, log)) === "revoked",
    });
  }
  graph.confirmations = (await listConfirmations()).map(c => ({
    reviewed_revision_id: c.reviewed_revision_id,
    expert_response_exchange_id: c.expert_response_exchange_id,
  }));
  return graph;
}

// --- apply ------------------------------------------------------------------------

export type ApplyOptions = {
  /** Recorded in tombstones and status transitions; never content. */
  reason: string;
  /** Off-record purge: tombstones say `dropped` (retries → 202), not deleted (→ 410). */
  dropped: boolean;
  /** Remove the expert's words from revoked revisions and from evaluations quoting them. */
  redact: boolean;
  now?: Date;
};

const rmrf = (p: string) => getBlobStore().deleteTree(p);

function emptySummary(): CascadeSummary {
  return {
    deleted: { session_ids: [], asset_ids: [], event_ids: [], exchange_ids: [] },
    trimmed_exchange_ids: [],
    revoked_revision_ids: [],
    stale_evaluation_ids: [],
    affected_session_ids: [],
  };
}

/** Serializes cascades; inside, locks are taken one at a time (session, then knowledge). */
const withCascadeLock = <T,>(fn: () => Promise<T>) => withLock("cascade", fn);

async function applyPlan(plan: CascadePlan, opts: ApplyOptions): Promise<CascadeSummary> {
  const now = opts.now ?? new Date();
  const at = now.toISOString();
  const tomb = (kind: "asset" | "event" | "exchange" | "session", id: string, sid: string | null) =>
    writeTombstone({
      kind,
      id,
      session_id: sid,
      ...(opts.dropped ? { record_state: "off_record" as const } : {}),
      dropped: opts.dropped,
      deleted_at_utc: at,
      reason: opts.reason,
    });
  const assetOwner = new Map<string, string>();
  for (const aid of plan.assets) {
    const meta = await loadAssetMeta(aid).catch(() => null);
    if (meta) assetOwner.set(aid, meta.session_id);
  }

  // 1. Tombstones first: from here on, no retry can recreate any of it.
  for (const sid of plan.sessions) await tomb("session", sid, null);
  for (const aid of plan.assets) await tomb("asset", aid, assetOwner.get(aid) ?? null);
  for (const e of plan.events) await tomb("event", e.id, e.session_id);
  for (const x of plan.exchanges) await tomb("exchange", x.id, x.session_id);

  // 2. Deleted sessions disappear entirely (records, bus, derived outputs, learner records).
  for (const sid of plan.sessions) {
    await withSessionLock(sid, async () => {
      await rmrf(sessionDir(sid));
      await rmrf(learnerDir(sid));
      await rmrf(path.join(assessmentsDir(), `${sid}.json`));
      await rmrf(path.join(assessmentsDir(), `${sid}.md`));
    });
  }

  // 3. Surviving sessions: remove records and derived outputs that may quote them; bump generation.
  const revokedBySession = new Set(plan.revisions.flatMap(r => (r.session_id ? [r.session_id] : [])));
  for (const sid of plan.affected_sessions) {
    await withSessionLock(sid, async () => {
      for (const e of plan.events.filter(e => e.session_id === sid)) await rmrf(sessionRecordFile(sid, "events", e.id));
      for (const x of plan.exchanges.filter(x => x.session_id === sid)) await rmrf(sessionRecordFile(sid, "exchanges", x.id));
      const touched =
        plan.events.some(e => e.session_id === sid) ||
        plan.exchanges.some(x => x.session_id === sid) ||
        plan.trimmed_exchanges.some(x => x.session_id === sid) ||
        revokedBySession.has(sid);
      if (touched && opts.redact) {
        // Teach-back text and gap descriptions are derived from the deleted words; synthesis rebuilds them.
        await rmrf(path.join(sessionDir(sid), "draft.json"));
        await rmrf(path.join(sessionDir(sid), "gaps.json"));
      }
      await bumpGenerationLocked(sid, now);
      for (const e of plan.events.filter(e => e.session_id === sid)) await appendBus(sid, "record.deleted", { event_id: e.id }, now);
      for (const x of plan.exchanges.filter(x => x.session_id === sid)) await appendBus(sid, "record.deleted", { exchange_id: x.id }, now);
    });
  }

  // 4. Asset bytes (global IDs).
  for (const aid of plan.assets) {
    await withLock(`asset:${aid}`, () => rmrf(assetDir(aid)));
    const owner = assetOwner.get(aid);
    if (owner && !plan.sessions.includes(owner)) await appendBus(owner, "record.deleted", { asset_id: aid }, now).catch(() => undefined);
  }

  // 5. Knowledge: revoke (WS5 rule: revoked is terminal) and, for deletions, redact.
  const revoked: string[] = [];
  await withKnowledgeLock(async () => {
    for (const r of plan.revisions) {
      const stored = await readRevision(r.entry_id, r.revision_id);
      if (!stored) continue;
      const t = nextStatus(await revisionStatus(stored.revision), { type: "revoke" });
      if (t.ok) await appendStatusTransition({ revision: stored.revision, to: "revoked", confirmation_id: null, reason: opts.reason }, now);
      if (opts.redact) await redactRevisionFile(stored.revision, opts.reason);
      revoked.push(r.revision_id);
    }
  });

  // 6. Newcomer sessions taught from revoked knowledge: their evaluations can no longer permit a commit.
  const revokedSet = new Set(plan.revisions.map(r => r.revision_id));
  const stale: string[] = [];
  const evalSessions = new Set([...plan.stale_evaluations, ...plan.citing_evaluations].map(e => e.session_id));
  for (const sid of evalSessions) {
    await withSessionLock(sid, async () => {
      stale.push(...(await invalidateEvaluationsLocked(sid, revokedSet, opts.redact, now)));
    });
  }

  // 7. Tell every stream that cared: the originating expert session and each pinning session.
  const pinners = (await loadCascadeGraph()).pins;
  for (const r of plan.revisions) {
    const targets = new Set([...(r.session_id ? [r.session_id] : []), ...pinners.filter(p => p.revision_ids.includes(r.revision_id)).map(p => p.session_id)]);
    for (const sid of targets) {
      if (plan.sessions.includes(sid)) continue;
      await appendBus(sid, "entry.revoked", { entry_id: r.entry_id, revision_id: r.revision_id }, now).catch(() => undefined);
    }
  }

  const summary = emptySummary();
  summary.deleted = {
    session_ids: plan.sessions,
    asset_ids: plan.assets,
    event_ids: plan.events.map(e => e.id),
    exchange_ids: plan.exchanges.map(x => x.id),
  };
  summary.trimmed_exchange_ids = plan.trimmed_exchanges.map(x => x.id);
  summary.revoked_revision_ids = revoked;
  summary.stale_evaluation_ids = [...new Set(stale)];
  summary.affected_session_ids = plan.affected_sessions;
  await diag({ component: "cascade", op: opts.reason.split(":")[0], ids: {}, outcome: "ok", duration_ms: 0 });
  return summary;
}

/** Sessions whose stored records are roots (a job reading them must not persist after this). */
async function ownerSessions(roots: readonly CascadeRoot[]): Promise<string[]> {
  const out = new Set<string>();
  for (const r of roots) {
    if (r.kind === "session") out.add(r.id);
    else if (r.kind === "event" || r.kind === "exchange" || r.kind === "trimmed_exchange") out.add(r.session_id);
    else if (r.kind === "asset") {
      const meta = await loadAssetMeta(r.id).catch(() => null);
      if (meta) out.add(meta.session_id);
    }
  }
  return [...out].sort();
}

export function runCascade(roots: readonly CascadeRoot[], opts: ApplyOptions): Promise<CascadeSummary> {
  return withCascadeLock(async () => {
    // Bump first: a job that has not persisted yet will be discarded; one that already persisted
    // wrote its revisions before the graph below is loaded, so the plan includes them.
    for (const sid of await ownerSessions(roots)) await withSessionLock(sid, () => bumpGenerationLocked(sid, opts.now ?? new Date()));
    return applyPlan(computeCascade(await loadCascadeGraph(), roots), opts);
  });
}

// --- entry points -----------------------------------------------------------------

async function notStoredOrGone(kind: "event" | "exchange", sid: string, id: string): Promise<CascadeSummary> {
  const t = await readTombstone(kind, id, sid);
  if (t) return emptySummary(); // already deleted or dropped: idempotent
  throw new ApiError("not_found", `${kind} not found.`, { [`${kind}_id`]: id });
}

export async function deleteEvent(sid: string, eid: string): Promise<CascadeSummary> {
  assertSafeId(eid, "event_id");
  await getSession(sid);
  const exists = (await getBlobStore().stat(sessionRecordFile(sid, "events", eid))) !== null;
  if (!exists) return notStoredOrGone("event", sid, eid);
  return runCascade([{ kind: "event", id: eid, session_id: sid }], { reason: `deleted:event:${eid}`, dropped: false, redact: true });
}

export async function deleteExchange(sid: string, xid: string): Promise<CascadeSummary> {
  assertSafeId(xid, "exchange_id");
  await getSession(sid);
  const exists = (await getBlobStore().stat(sessionRecordFile(sid, "exchanges", xid))) !== null;
  if (!exists) return notStoredOrGone("exchange", sid, xid);
  return runCascade([{ kind: "exchange", id: xid, session_id: sid }], { reason: `deleted:exchange:${xid}`, dropped: false, redact: true });
}

export async function deleteAsset(aid: string): Promise<CascadeSummary> {
  assertSafeId(aid, "asset_id");
  const meta = await loadAssetMeta(aid).catch(() => null);
  if (!meta) {
    if (await readTombstone("asset", aid, null)) return emptySummary();
    throw new ApiError("not_found", "Asset not found.", { asset_id: aid });
  }
  return runCascade([{ kind: "asset", id: aid }], { reason: `deleted:asset:${aid}`, dropped: false, redact: true });
}

export async function deleteSession(sid: string): Promise<CascadeSummary> {
  assertSafeId(sid, "session_id");
  if (await readTombstone("session", sid, null)) return emptySummary();
  await getSession(sid);
  return runCascade([{ kind: "session", id: sid }], { reason: `deleted:session:${sid}`, dropped: false, redact: true });
}

/** Revocation keeps the text (it was wrong or withdrawn, not private) but stops all teaching from it. */
export async function revokeEntry(entryId: string, req: { reason: string; revision_id?: string }) {
  assertSafeId(entryId, "entry_id");
  const entry = await loadEntry(entryId);
  if (!entry) throw new ApiError("not_found", "Entry not found.", { entry_id: entryId });
  const revisionId = req.revision_id ?? entry.current_revision_id;
  const stored = await readRevision(entryId, revisionId);
  if (!stored) throw new ApiError("not_found", "Revision not found.", { entry_id: entryId, revision_id: revisionId });
  const cascade = await runCascade([{ kind: "revision", id: revisionId }], { reason: `revoked: ${req.reason}`, dropped: false, redact: false });
  const after = await loadEntry(entryId);
  return { entry: after ?? entry, revoked_revision_id: revisionId, cascade };
}

/**
 * Record-state change; with `since_utc` everything captured since then is purged as if it had
 * arrived off the record: content removed, `dropped` tombstones, citing revisions revoked and
 * redacted, answer lines spoken since then cut from longer exchanges. Not persisted, not forwarded.
 */
export async function setRecordState(sid: string, req: RecordStateRequest, now: Date = new Date()): Promise<{ session: Session; purge: CascadeSummary | null }> {
  const session = await changeRecordState(sid, req, now);
  if (req.state !== "off_record" || req.since_utc === undefined) return { session, purge: null };
  return withCascadeLock(async () => {
    const roots: CascadeRoot[] = [];
    const s = await getSession(sid);
    const inside = (utc: string | null | undefined) => isOffRecordAt(s, utc);
    await withSessionLock(sid, async () => {
      await bumpGenerationLocked(sid, now); // see runCascade: before the graph is loaded
      for (const e of await listEvents(sid)) if (inside(e.captured_at_utc)) roots.push({ kind: "event", id: e.event_id, session_id: sid });
      for (const x of await listExchanges(sid)) {
        if (inside(x.asked_at_utc)) {
          roots.push({ kind: "exchange", id: x.exchange_id, session_id: sid });
          continue;
        }
        const kept = x.answer_lines.filter(l => !inside(l.at_utc));
        if (kept.length === x.answer_lines.length) continue;
        const trimmed: ExchangePut = { ...x, answer_lines: kept };
        await writeJsonAtomic(sessionRecordFile(sid, "exchanges", x.exchange_id), trimmed);
        roots.push({ kind: "trimmed_exchange", id: x.exchange_id, session_id: sid });
      }
    });
    for (const aid of await listAssetIds()) {
      const a = await loadAssetMeta(aid).catch(() => null);
      if (a?.session_id === sid && inside(a.captured_at_utc)) roots.push({ kind: "asset", id: aid });
    }
    const purge = roots.length
      ? await applyPlan(computeCascade(await loadCascadeGraph(), roots), { reason: "off_record_purge", dropped: true, redact: true, now })
      : emptySummary();
    return { session: await getSession(sid), purge };
  });
}
