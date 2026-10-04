/**
 * Newcomer sessions: an unseen case plus pinned knowledge. Eligibility is WS5's `selectEligible`
 * over the current revision of every entry; WS6 only gathers the stored records it needs.
 */
import { SessionSchema, type CreateSessionRequest, type KnowledgeRef, type KnowledgeRevision, type Session } from "@/lib/contracts";
import { selectEligible, type KnowledgeCandidate } from "@/lib/knowledge";
import { appendBus } from "./bus";
import { pickNewcomerCase } from "./cases";
import { listConfirmations } from "./confirmations";
import { ApiError } from "./errors";
import { listEvents } from "./events";
import { listExchanges } from "./exchanges";
import { listEntries, loadEntry, readRevision, readStatusLog, revisionStatus } from "./knowledge";
import { sessionFile } from "./paths";
import { createSession, getSession } from "./sessions";
import { putMutable } from "./store";
import { readExpertDraftView } from "./synthesis";
import { isWs5Revision, latestConfirmation, revocationOf, ws5Content, ws5RevisionId, type Revocation } from "./ws5-content";

export type PinExclusion = { entry_id: string; revision_id: string | null; reason: string };
export type PinResult = { pinned: KnowledgeRef[]; excluded: PinExclusion[] };

type Current = {
  rev: KnowledgeRevision;
  markdown: string;
  status: Awaited<ReturnType<typeof revisionStatus>>;
  revocation: Revocation | null;
};

async function currentRevisions(): Promise<Current[]> {
  const out: Current[] = [];
  for (const entry of await listEntries()) {
    const stored = await readRevision(entry.entry_id, entry.current_revision_id);
    if (!stored) continue;
    const log = await readStatusLog(entry.entry_id);
    out.push({
      rev: stored.revision,
      markdown: stored.markdown,
      status: await revisionStatus(stored.revision, log),
      revocation: revocationOf(log, stored.revision.revision_id),
    });
  }
  return out;
}

/** Events and exchanges of the given expert sessions (linked evidence for eligibility). */
export async function loadSessionRecords(sessionIds: Iterable<string>) {
  const ids = [...new Set(sessionIds)];
  const events = (await Promise.all(ids.map(id => listEvents(id).catch(() => [])))).flat();
  const exchanges = (await Promise.all(ids.map(id => listExchanges(id).catch(() => [])))).flat();
  return { events, exchanges };
}

async function flaggedRevisionIds(sessionIds: Iterable<string>): Promise<Set<string>> {
  const out = new Set<string>();
  for (const sid of new Set(sessionIds)) {
    const view = await readExpertDraftView(sid).catch(() => null);
    for (const f of view?.flagged_for_reconfirmation ?? []) out.add(f.revision_id);
  }
  return out;
}

/**
 * The knowledge a newcomer session may be taught from, right now. WS5 decides for WS5 content;
 * non-WS5 (stub) revisions are never real expert knowledge, so they count as fixture material.
 */
export async function selectPinnedKnowledge(allowFixture: boolean): Promise<PinResult> {
  const current = await currentRevisions();
  const sessionIds = current.flatMap(c => (c.rev.session_id ? [c.rev.session_id] : []));
  const [records, confirmations, flagged] = await Promise.all([
    loadSessionRecords(sessionIds),
    listConfirmations(),
    flaggedRevisionIds(sessionIds),
  ]);

  const pinned: KnowledgeRef[] = [];
  const excluded: PinExclusion[] = [];
  const candidates: KnowledgeCandidate[] = [];
  const ws6Id = new Map<string, string>();

  for (const c of current) {
    const ref = { entry_id: c.rev.entry_id, revision_id: c.rev.revision_id };
    if (flagged.has(c.rev.revision_id)) {
      excluded.push({ ...ref, reason: "flagged_for_reconfirmation" });
      continue;
    }
    if (!isWs5Revision(c.rev)) {
      if (c.status !== "confirmed") excluded.push({ ...ref, reason: `not_confirmed: status is ${c.status}` });
      else if (!allowFixture) excluded.push({ ...ref, reason: `fixture_not_allowed: produced by ${c.rev.produced_by.module} (${c.rev.produced_by.source})` });
      else pinned.push(ref);
      continue;
    }
    const content = ws5Content(c.markdown, c.rev, c.status, latestConfirmation(confirmations, c.rev.revision_id), c.revocation);
    if (!content) {
      excluded.push({ ...ref, reason: "invalid: not readable as WS5 content" });
      continue;
    }
    ws6Id.set(`${content.entry_id}@${content.revision_id}`, c.rev.revision_id);
    candidates.push({ record_type: "knowledge_entry", path: `entries/${c.rev.entry_id}/${content.revision_id}.md`, entry: content });
  }

  const selected = selectEligible(candidates, {
    current_revision_by_entry: Object.fromEntries(current.map(c => [c.rev.entry_id, ws5RevisionId(c.rev.revision_no)])),
    events: records.events,
    exchanges: records.exchanges,
    allow_fixture: allowFixture,
  });
  for (const e of selected.pinned) {
    const id = ws6Id.get(`${e.entry_id}@${e.revision_id}`);
    if (id) pinned.push({ entry_id: e.entry_id, revision_id: id });
  }
  for (const x of selected.excluded) {
    excluded.push({
      entry_id: x.entry_id ?? "unknown",
      revision_id: x.entry_id && x.revision_id ? (ws6Id.get(`${x.entry_id}@${x.revision_id}`) ?? null) : null,
      reason: `${x.reason}: ${x.detail}`,
    });
  }
  pinned.sort((a, b) => a.entry_id.localeCompare(b.entry_id));
  return { pinned, excluded };
}

function requirePins(result: PinResult): KnowledgeRef[] {
  if (result.pinned.length === 0) {
    throw new ApiError("no_confirmed_knowledge", "No confirmed knowledge is eligible for teaching yet.", {
      // Entry IDs and reason codes only; the `detail` part may name records, never content.
      excluded: result.excluded.map(x => ({ entry_id: x.entry_id, revision_id: x.revision_id, reason: x.reason.split(":")[0] })),
    });
  }
  return result.pinned;
}

/** True while every pinned revision is still its entry's current, confirmed revision. */
export async function pinnedKnowledgeCurrent(pins: readonly KnowledgeRef[]): Promise<boolean> {
  for (const pin of pins) {
    const entry = await loadEntry(pin.entry_id).catch(() => null);
    if (!entry || entry.current_revision_id !== pin.revision_id) return false;
    const stored = await readRevision(pin.entry_id, pin.revision_id).catch(() => null);
    if (!stored || (await revisionStatus(stored.revision)) !== "confirmed") return false;
  }
  return true;
}

export async function createNewcomerSession(
  req: Extract<CreateSessionRequest, { role: "newcomer" }>,
  opts: { idempotencyKey?: string | null; allowFixtureKnowledge: boolean },
  now: Date = new Date(),
): Promise<{ status: 200 | 201; session: Session }> {
  return createSession(req, opts.idempotencyKey, now, async () => {
    const file = await pickNewcomerCase(req.case_id);
    const pinned = requirePins(await selectPinnedKnowledge(opts.allowFixtureKnowledge));
    return {
      case_id: file.case_id,
      trace_ref: `/api/cases/${file.case_id}/trace`,
      pinned_knowledge: pinned,
      knowledge_fixture_allowed: opts.allowFixtureKnowledge,
    };
  });
}

/**
 * Re-pins a newcomer session to the knowledge eligible now (after a revision, correction or
 * revocation). Call inside the session lock; the learner module then marks evaluations stale.
 */
export async function repinSessionLocked(sid: string, now: Date = new Date()): Promise<Session> {
  const session = await getSession(sid);
  if (session.role !== "newcomer") throw new ApiError("invalid_transition", "Only newcomer sessions pin knowledge.", { role: session.role });
  const pinned = requirePins(await selectPinnedKnowledge(session.knowledge_fixture_allowed === true));
  const same = JSON.stringify(pinned) === JSON.stringify(session.pinned_knowledge);
  if (same) return session;
  const next: Session = { ...session, pinned_knowledge: pinned, rev: session.rev + 1 };
  await putMutable(sessionFile(sid), next, { schema: SessionSchema });
  await appendBus(sid, "session.updated", { session_id: sid }, now);
  return next;
}
