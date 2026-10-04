/**
 * Newcomer drafts, tutor evaluations and the pre-save commit. Every state change runs under the
 * session lock and re-reads from disk, so a double submit, a pending evaluation, an edit after
 * evaluation or changed knowledge can never slip past `canCommit`.
 * Storage layout: `learner-store.ts`.
 */
import { createHash } from "node:crypto";
import {
  CitationSchema,
  CommitSchema,
  EvaluationSchema,
  LearnerDraftSchema,
  type Commit,
  type CommitRequest,
  type Evaluation,
  type EvaluationRequest,
  type KnowledgeRevision,
  type LearnerDraft,
  type PutLearnerDraftRequest,
  type Session,
} from "@/lib/contracts";
import { storeAssessmentLocked } from "./assessment";
import { loadAssetMeta } from "./assets";
import { appendBus } from "./bus";
import { loadCaseFile } from "./cases";
import { canCommit, DEFAULT_OUTCOME_POLICY, type CommitPolicyCode } from "./commit-policy";
import { diag } from "./diag";
import { listConfirmations } from "./confirmations";
import { ApiError, type ErrorCode } from "./errors";
import { assertSafeId, newId } from "./ids";
import { listEntries, readRevision, readStatusLog, revisionStatus } from "./knowledge";
import { tutorProvider, type TutorHost, type TutorProvider, type TutorResult } from "./modules";
import { loadSessionRecords, pinnedKnowledgeCurrent, repinSessionLocked } from "./newcomer";
import {
  commitFile,
  draftFile,
  draftHistoryFile,
  evaluationFile,
  listEvaluations,
  loadCommit,
  loadDraft,
  loadEvaluation,
} from "./learner-store";
import { getSession, requireWritableSession, withSessionLock } from "./sessions";
import { canonicalJson, putImmutable, readJson, writeJsonAtomic } from "./store";
import { latestConfirmation, revocationOf } from "./ws5-content";

// --- guards -----------------------------------------------------------------------

async function requireNewcomer(sid: string): Promise<Session> {
  assertSafeId(sid, "session_id");
  const session = await getSession(sid);
  if (session.role !== "newcomer") {
    throw new ApiError("invalid_transition", "Only newcomer sessions have learner drafts.", { role: session.role });
  }
  return session;
}

/** Draft edits and evaluations need an open, uncommitted newcomer session. */
async function requireOpenNewcomer(sid: string): Promise<Session> {
  const session = await requireNewcomer(sid);
  if (session.lifecycle === "ended" || session.lifecycle === "aborted") {
    throw new ApiError("invalid_transition", `Session is ${session.lifecycle}.`, { lifecycle: session.lifecycle });
  }
  if (await loadCommit(sid)) throw new ApiError("invalid_transition", "The decision is already committed.", { reason: "committed" });
  return session;
}

const pinsOf = (session: Session) => session.pinned_knowledge ?? [];

// --- evaluation status changes ----------------------------------------------------

type StaleReason = NonNullable<Evaluation["stale_reason"]>;

/** Marks every pending/done evaluation stale. Call inside the session lock. */
export async function markEvaluationsStale(sid: string, reason: StaleReason, now: Date): Promise<void> {
  for (const e of await listEvaluations(sid)) {
    if (e.status !== "pending" && e.status !== "done") continue;
    await writeJsonAtomic(evaluationFile(sid, e.evaluation_id), {
      ...e,
      status: "stale",
      stale_reason: reason,
      updated_at_utc: now.toISOString(),
    } satisfies Evaluation);
    await appendBus(sid, "evaluation.updated", { evaluation_id: e.evaluation_id, draft_rev: String(e.draft_rev) }, now);
  }
}

/**
 * S4 cascade: evaluations that used revoked revisions become stale (`knowledge_changed`); with
 * `redact`, every evaluation citing them also loses its quoted text (deleted evidence must not
 * survive as a quote). Call inside the session lock. Returns the changed evaluation IDs.
 */
export async function invalidateEvaluationsLocked(sid: string, revisionIds: ReadonlySet<string>, redact: boolean, now: Date): Promise<string[]> {
  const changed: string[] = [];
  for (const e of await listEvaluations(sid)) {
    const usesRevoked = e.knowledge_revision_ids.some(id => revisionIds.has(id));
    const stale = usesRevoked && (e.status === "pending" || e.status === "done");
    const citesRevoked = e.cited.some(c => revisionIds.has(c.revision_id)) || (e.escalation ? revisionIds.has(e.escalation.revision_id) : false);
    const scrub = redact && citesRevoked && (e.feedback_text !== null || e.cited.some(c => c.quote !== undefined));
    if (!stale && !scrub) continue;
    const next: Evaluation = {
      ...e,
      ...(stale ? { status: "stale" as const, stale_reason: "knowledge_changed" as const } : {}),
      ...(scrub
        ? {
            cited: e.cited.map(({ quote: _quote, ...c }) => c),
            feedback_text: null,
            guiding_question: null,
            uncertainty: null,
            evidence: undefined,
            guard_notes: undefined,
          }
        : {}),
      updated_at_utc: now.toISOString(),
    };
    await writeJsonAtomic(evaluationFile(sid, e.evaluation_id), EvaluationSchema.parse(next));
    await appendBus(sid, "evaluation.updated", { evaluation_id: e.evaluation_id, draft_rev: String(e.draft_rev) }, now);
    changed.push(e.evaluation_id);
  }
  return changed;
}

// --- draft ------------------------------------------------------------------------

export async function getLearnerDraft(sid: string): Promise<LearnerDraft> {
  await requireNewcomer(sid);
  const draft = await loadDraft(sid);
  if (!draft) throw new ApiError("not_found", "No draft yet.", { session_id: sid });
  return draft;
}

const sameBody = (d: LearnerDraft, req: PutLearnerDraftRequest) =>
  canonicalJson({ decision: d.decision, reason: d.reason, visual_context: d.visual_context }) ===
  canonicalJson({ decision: req.decision, reason: req.reason, visual_context: req.visual_context });

export async function putLearnerDraft(
  sid: string,
  req: PutLearnerDraftRequest,
  now: Date = new Date(),
): Promise<{ status: 200 | 201; draft: LearnerDraft }> {
  return withSessionLock(sid, async () => {
    const session = await requireOpenNewcomer(sid);
    await requireWritableSession(sid);
    const current = await loadDraft(sid);
    const currentRev = current?.draft_rev ?? 0;
    // A retry of the request that produced the current draft is a no-op.
    if (current && req.base_draft_rev === currentRev - 1 && sameBody(current, req)) return { status: 200, draft: current };
    if (req.base_draft_rev !== currentRev) {
      throw new ApiError("stale_revision", "The draft changed since you loaded it.", {
        current_draft_rev: currentRev,
        received_base_draft_rev: req.base_draft_rev,
      });
    }
    for (const v of req.visual_context) {
      const asset = await loadAssetMeta(v.asset_id).catch(() => null);
      if (!asset || asset.status !== "stored" || asset.session_id !== sid) {
        throw new ApiError("asset_not_available", "Visual context refers to an asset that is not stored for this session.", {
          asset_id: v.asset_id,
        });
      }
    }
    const draft: LearnerDraft = {
      session_id: sid,
      draft_rev: currentRev + 1,
      decision: req.decision,
      reason: req.reason,
      visual_context: req.visual_context,
      updated_at_utc: now.toISOString(),
      source: session.source,
    };
    await putImmutable(draftHistoryFile(sid, draft.draft_rev), draft, LearnerDraftSchema);
    await writeJsonAtomic(draftFile(sid), draft);
    await markEvaluationsStale(sid, "draft_changed", now);
    await appendBus(sid, "draft.updated", { draft_rev: String(draft.draft_rev) }, now);
    return { status: current ? 200 : 201, draft };
  });
}

// --- evaluation -------------------------------------------------------------------

type Running = { done: Promise<Evaluation> };
const globalRuns = globalThis as typeof globalThis & { __ws6EvalRuns?: Map<string, Running> };
const running: Map<string, Running> = (globalRuns.__ws6EvalRuns ??= new Map());

export type EvaluationHandle = { status: 200 | 202; evaluation: Evaluation; done: Promise<Evaluation> };

export async function requestEvaluation(sid: string, req: EvaluationRequest, now: Date = new Date()): Promise<EvaluationHandle> {
  const provider = tutorProvider();
  const started = await withSessionLock(sid, async (): Promise<EvaluationHandle | { start: Evaluation; generation: number }> => {
    const session = await requireOpenNewcomer(sid);
    const draft = await loadDraft(sid);
    if (!draft || draft.draft_rev !== req.draft_rev) {
      throw new ApiError("stale_revision", "Only the current draft can be evaluated.", {
        current_draft_rev: draft?.draft_rev ?? 0,
        received_draft_rev: req.draft_rev,
      });
    }
    for (const e of await listEvaluations(sid)) {
      if (e.draft_rev !== req.draft_rev) continue;
      if (e.status === "done") return { status: 200, evaluation: e, done: Promise.resolve(e) };
      if (e.status !== "pending") continue;
      const run = running.get(e.evaluation_id);
      if (run) return { status: 200, evaluation: e, done: run.done };
      // Pending on disk but not running in this process: the server restarted mid-evaluation.
      const failed: Evaluation = { ...e, status: "failed", error_code: "interrupted", updated_at_utc: now.toISOString() };
      await writeJsonAtomic(evaluationFile(sid, e.evaluation_id), failed);
      await appendBus(sid, "evaluation.updated", { evaluation_id: e.evaluation_id, draft_rev: String(e.draft_rev) }, now);
    }
    const pins = pinsOf(session);
    if (!(await pinnedKnowledgeCurrent(pins))) {
      throw new ApiError("evaluation_stale", "The pinned knowledge changed; re-pin the session (POST …/pin) first.", {
        policy_code: "knowledge_changed",
      });
    }
    const at = now.toISOString();
    const evaluation: Evaluation = {
      evaluation_id: newId("evl", now),
      session_id: sid,
      draft_rev: draft.draft_rev,
      knowledge_revision_ids: pins.map(p => p.revision_id),
      status: "pending",
      outcome: null,
      cited: [],
      feedback_text: null,
      created_at_utc: at,
      updated_at_utc: at,
      produced_by: { module: provider.info.id, version: provider.info.version, source: provider.info.source },
    };
    await putImmutable(evaluationFile(sid, evaluation.evaluation_id), evaluation, EvaluationSchema);
    await appendBus(sid, "evaluation.updated", { evaluation_id: evaluation.evaluation_id, draft_rev: String(draft.draft_rev) }, now);
    return { start: evaluation, generation: session.generation ?? 0 };
  });
  if (!("start" in started)) return started;
  const evaluation = started.start;
  // `done` never rejects: nobody awaits it in production, and a vanished record (session deleted)
  // must not become an unhandled rejection. The failure is logged by ID only.
  const done = runEvaluation(sid, evaluation, provider, started.generation).catch(async () => {
    await diag({ component: "evaluations", op: "finish", ids: { session_id: sid, evaluation_id: evaluation.evaluation_id }, outcome: "error", duration_ms: 0, error_code: "internal" });
    return evaluation;
  });
  running.set(evaluation.evaluation_id, { done });
  void done.finally(() => running.delete(evaluation.evaluation_id));
  return { status: 202, evaluation, done };
}

async function pinnedRevisions(session: Session): Promise<KnowledgeRevision[]> {
  const out: KnowledgeRevision[] = [];
  for (const pin of pinsOf(session)) {
    const stored = await readRevision(pin.entry_id, pin.revision_id);
    if (!stored) throw new Error(`pinned revision ${pin.revision_id} is not stored`);
    out.push(stored.revision);
  }
  return out;
}

function tutorHost(session: Session, knowledge: KnowledgeRevision[]): TutorHost {
  return {
    allowFixture: session.knowledge_fixture_allowed === true,
    async loadMarkdown(rev) {
      return (await readRevision(rev.entry_id, rev.revision_id))?.markdown ?? null;
    },
    async revisionContext(rev) {
      const log = await readStatusLog(rev.entry_id);
      return {
        status: await revisionStatus(rev, log),
        confirmation: latestConfirmation(await listConfirmations(), rev.revision_id),
        revocation: revocationOf(log, rev.revision_id),
      };
    },
    async loadRecords() {
      const { events, exchanges } = await loadSessionRecords(knowledge.flatMap(r => (r.session_id ? [r.session_id] : [])));
      const current_revision_no_by_entry = Object.fromEntries((await listEntries()).map(e => [e.entry_id, e.current_revision_no]));
      return { events, exchanges, current_revision_no_by_entry };
    },
  };
}

/** Module output → stored fields. Citations must name pinned revisions only. */
function acceptResult(r: TutorResult, pinnedIds: readonly string[]): Partial<Evaluation> {
  const cited = r.cited.map(c => CitationSchema.parse(c));
  const pinned = new Set(pinnedIds);
  if (typeof r.outcome !== "string" || !r.outcome) throw new Error("tutor output has no outcome");
  if (cited.some(c => !pinned.has(c.revision_id))) throw new Error("tutor cited knowledge that is not pinned");
  if (r.escalation && !pinned.has(r.escalation.revision_id)) throw new Error("tutor escalation is not pinned");
  return {
    outcome: r.outcome,
    cited,
    feedback_text: r.feedback_text,
    guiding_question: r.guiding_question ?? null,
    escalation: r.escalation ?? null,
    uncertainty: r.uncertainty ?? null,
    ...(r.evidence ? { evidence: r.evidence } : {}),
    ...(r.guard_notes ? { guard_notes: r.guard_notes } : {}),
  };
}

async function runEvaluation(sid: string, evaluation: Evaluation, provider: TutorProvider, generation: number): Promise<Evaluation> {
  let fields: Partial<Evaluation> | null = null;
  let errorCode: string | null = null;
  try {
    const session = await getSession(sid);
    const draft = await readJson(draftHistoryFile(sid, evaluation.draft_rev), LearnerDraftSchema);
    if (!draft || !session.case_id) throw new Error("draft or case missing");
    const file = await loadCaseFile(session.case_id);
    const knowledge = await pinnedRevisions(session);
    const result = await provider.create(tutorHost(session, knowledge)).evaluate({
      draft,
      case_view: {
        case_id: file.case_id,
        title: file.title,
        trace_asset: file.trace_asset,
        shown_to_expert: file.shown_to_expert,
        source: file.source,
        visible_context: [...file.visible_context],
      },
      knowledge,
    });
    fields = acceptResult(result, evaluation.knowledge_revision_ids);
  } catch {
    // Module errors may carry content; only the code is stored.
    errorCode = "module_error";
  }
  return finishEvaluation(sid, evaluation.evaluation_id, fields, errorCode, generation);
}

const sameSet = (a: readonly string[], b: readonly string[]) => canonicalJson([...a].sort()) === canonicalJson([...b].sort());

/** Stores the result under the session lock; a draft or knowledge change meanwhile → `stale`, never `done`. */
async function finishEvaluation(
  sid: string,
  eid: string,
  fields: Partial<Evaluation> | null,
  errorCode: string | null,
  generation: number,
): Promise<Evaluation> {
  return withSessionLock(sid, async () => {
    const now = new Date();
    const e = await loadEvaluation(sid, eid);
    if (!e) throw new Error(`evaluation ${eid} vanished`);
    if (e.status !== "pending" && e.status !== "stale") return e;
    const session = await getSession(sid);
    const draft = await loadDraft(sid);
    let staleReason: StaleReason | null = e.status === "stale" ? (e.stale_reason ?? "draft_changed") : null;
    if (!staleReason && (!draft || draft.draft_rev !== e.draft_rev)) staleReason = "draft_changed";
    // A cascade touched this session (e.g. a visual-context frame was deleted) while the tutor ran.
    if (!staleReason && (session.generation ?? 0) !== generation) staleReason = "draft_changed";
    const pins = pinsOf(session);
    if (!staleReason && (!sameSet(pins.map(p => p.revision_id), e.knowledge_revision_ids) || !(await pinnedKnowledgeCurrent(pins)))) {
      staleReason = "knowledge_changed";
    }
    const next: Evaluation = {
      ...e,
      ...(fields ?? {}),
      status: staleReason ? "stale" : fields ? "done" : "failed",
      stale_reason: staleReason,
      error_code: errorCode,
      completed_at_utc: now.toISOString(),
      updated_at_utc: now.toISOString(),
    };
    await writeJsonAtomic(evaluationFile(sid, eid), EvaluationSchema.parse(next));
    if (e.status === "pending") await appendBus(sid, "evaluation.updated", { evaluation_id: eid, draft_rev: String(e.draft_rev) }, now);
    return next;
  });
}

export async function getEvaluation(sid: string, eid: string): Promise<Evaluation> {
  await requireNewcomer(sid);
  assertSafeId(eid, "evaluation_id");
  const e = await loadEvaluation(sid, eid);
  if (!e) throw new ApiError("not_found", "Evaluation not found.", { evaluation_id: eid });
  return e;
}

export async function getEvaluations(sid: string): Promise<Evaluation[]> {
  await requireNewcomer(sid);
  return listEvaluations(sid);
}

// --- re-pin -----------------------------------------------------------------------

/** Re-pins the session to the knowledge eligible now; every earlier evaluation becomes stale. */
export async function repinSession(sid: string, now: Date = new Date()): Promise<Session> {
  return withSessionLock(sid, async () => {
    const before = pinsOf(await requireOpenNewcomer(sid)).map(p => p.revision_id);
    const session = await repinSessionLocked(sid, now);
    if (!sameSet(before, pinsOf(session).map(p => p.revision_id))) await markEvaluationsStale(sid, "knowledge_changed", now);
    return session;
  });
}

// --- commit -----------------------------------------------------------------------

/** canCommit code → the S0 error code it travels under (D10); the policy code stays in `details`. */
const POLICY_ERROR: Record<CommitPolicyCode, ErrorCode> = {
  evaluation_required: "evaluation_required",
  evaluation_pending: "evaluation_pending",
  evaluation_stale: "evaluation_stale",
  knowledge_changed: "evaluation_stale",
  blocked_by_outcome: "commit_blocked",
  already_committed: "commit_blocked",
};

const POLICY_MESSAGES: Record<CommitPolicyCode, string> = {
  evaluation_required: "Get a tutor evaluation of the current draft before saving.",
  evaluation_pending: "The tutor evaluation is still running.",
  evaluation_stale: "The draft changed after it was evaluated; evaluate the current draft.",
  knowledge_changed: "The knowledge this session was taught from changed; re-pin and evaluate again.",
  blocked_by_outcome: "The tutor's outcome does not permit saving this draft.",
  already_committed: "This session's decision is already saved.",
};

const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function commitDraft(sid: string, req: CommitRequest, now: Date = new Date()): Promise<{ status: 200 | 201; commit: Commit }> {
  return withSessionLock(sid, async () => {
    const session = await requireNewcomer(sid);
    const hash = keyHash(req.idempotency_key);
    const existing = await loadCommit(sid);
    if (existing?.idempotency_key_sha256 === hash) return { status: 200, commit: existing };
    if (!existing && (session.lifecycle === "ended" || session.lifecycle === "aborted")) {
      throw new ApiError("invalid_transition", `Session is ${session.lifecycle}.`, { lifecycle: session.lifecycle });
    }
    const draft = await loadDraft(sid);
    const evaluation = req.evaluation_id ? await loadEvaluation(sid, req.evaluation_id) : null;
    const pins = pinsOf(session);
    const decision = canCommit(
      {
        draft,
        latestEvaluation: evaluation,
        requestDraftRev: req.draft_rev,
        pinnedRevisionIds: pins.map(p => p.revision_id),
        pinnedKnowledgeCurrent: existing ? true : await pinnedKnowledgeCurrent(pins),
        committed: existing !== null,
        escalated: req.escalated,
      },
      DEFAULT_OUTCOME_POLICY,
    );
    if (!decision.ok) {
      throw new ApiError(POLICY_ERROR[decision.code], POLICY_MESSAGES[decision.code], { policy_code: decision.code, ...(decision.details ?? {}) });
    }
    const commit: Commit = {
      commit_id: newId("cmt", now),
      session_id: sid,
      draft_rev: req.draft_rev,
      evaluation_id: evaluation!.evaluation_id,
      at_utc: now.toISOString(),
      outcome: evaluation!.outcome ?? undefined,
      escalated: decision.escalated,
      knowledge_revision_ids: [...evaluation!.knowledge_revision_ids],
      idempotency_key_sha256: hash,
    };
    await putImmutable(commitFile(sid), commit, CommitSchema);
    await appendBus(sid, "commit.stored", { commit_id: commit.commit_id, evaluation_id: commit.evaluation_id, draft_rev: String(commit.draft_rev) }, now);
    await storeAssessmentLocked(sid, now);
    return { status: 201, commit };
  });
}

export async function getCommit(sid: string): Promise<Commit> {
  await requireNewcomer(sid);
  const c = await loadCommit(sid);
  if (!c) throw new ApiError("not_found", "Not committed.", { session_id: sid });
  return c;
}

/** Newcomer `end` → the assessment is written from whatever happened (no-op if it exists). */
export async function onNewcomerEnded(sid: string, now: Date = new Date()): Promise<void> {
  await withSessionLock(sid, () => storeAssessmentLocked(sid, now));
}
