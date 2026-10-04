/**
 * Synthesis jobs: run the hosted synthesis module on a session in the background and persist its
 * drafts, workflow, gaps and teach-back.
 *
 * - One queued/running job per session; a second request gets the same job_id.
 * - The job snapshots its inputs (event IDs, exchange revs, entries' current revisions, the
 *   session's confirmations) when it starts. It persists only if none of them changed or
 *   disappeared meanwhile — checked under session lock → knowledge lock, so no write can slip in
 *   between the check and the persist. Otherwise it is `discarded` (S4 adds generation tokens).
 * - Job records, bus events and diagnostics carry IDs and codes only.
 */
import path from "node:path";
import {
  GapSchema,
  GapsViewSchema,
  ProducedBySchema,
  SessionDraftViewSchema,
  type EvidenceAsset,
  type GapsView,
  type Job,
  type JobInputRevs,
  type KnowledgeRef,
  type KnowledgeRevision,
  type ModuleInfo,
  type SessionDraftView,
} from "@/lib/contracts";
import { loadAssetMeta } from "./assets";
import { appendBus } from "./bus";
import { listSessionConfirmations, toExpertConfirmation } from "./confirmations";
import { diag } from "./diag";
import { ApiError } from "./errors";
import { listEvents } from "./events";
import { listExchanges } from "./exchanges";
import { assertSafeId, isValidId, newId } from "./ids";
import { listSessionJobs, saveJob } from "./jobs";
import {
  commitRevision,
  listAllRevisions,
  listEntries,
  readRevisionByNo,
  RevisionConflictError,
  planRevision,
  withKnowledgeLock,
  writeWorkflow,
  type RevisionPlan,
} from "./knowledge";
import { withLock } from "./locks";
import { synthesisProvider, type SynthesisHost, type SynthesisOutput } from "./modules";
import { sessionDir } from "./paths";
import { getSession, withSessionLock } from "./sessions";
import { readJson, writeJsonAtomic } from "./store";

type Running = { job_id: string; done: Promise<Job> };
const g = globalThis as typeof globalThis & { __ws6SynthesisJobs?: Map<string, Running> };
const active = (g.__ws6SynthesisJobs ??= new Map());

const gapsFile = (sid: string) => path.join(sessionDir(sid), "gaps.json");
const draftFile = (sid: string) => path.join(sessionDir(sid), "draft.json");

class JobFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

// --- reads ----------------------------------------------------------------------

export async function getGaps(sid: string): Promise<GapsView> {
  await getSession(sid);
  return (
    (await readJson(gapsFile(sid), GapsViewSchema)) ?? {
      session_id: sid,
      job_id: null,
      produced_by: null,
      gaps: [],
      updated_at_utc: null,
    }
  );
}

/** The stored synthesis draft view of an expert session, or null. */
export function readExpertDraftView(sid: string): Promise<SessionDraftView | null> {
  return readJson(draftFile(sid), SessionDraftViewSchema);
}

export async function getSessionDraft(sid: string): Promise<SessionDraftView> {
  const session = await getSession(sid);
  if (session.role !== "expert") {
    throw new ApiError("not_found", "Newcomer drafts are served by the learner draft route.", { session_id: sid });
  }
  return (
    (await readJson(draftFile(sid), SessionDraftViewSchema)) ?? {
      session_id: sid,
      job_id: null,
      produced_by: null,
      revision_ids: [],
      reviewed: [],
      teach_back: null,
      flagged_for_reconfirmation: [],
      updated_at_utc: null,
    }
  );
}

// --- start ----------------------------------------------------------------------

export type SynthesisRequest = { job_id: string; created: boolean; done: Promise<Job> };

export async function requestSynthesis(sid: string, now: Date = new Date()): Promise<SynthesisRequest> {
  assertSafeId(sid, "session_id");
  const session = await getSession(sid);
  if (session.role !== "expert") {
    throw new ApiError("invalid_transition", "Synthesis runs on expert sessions only.", { role: session.role });
  }
  if (session.lifecycle === "aborted") {
    throw new ApiError("invalid_transition", "Session is aborted.", { lifecycle: session.lifecycle });
  }
  return withLock(`synth:${sid}`, async () => {
    const running = active.get(sid);
    if (running) return { job_id: running.job_id, created: false, done: running.done };

    // A queued/running record nobody is executing was left by a restart.
    for (const stale of await listSessionJobs(sid)) {
      if (stale.status === "queued" || stale.status === "running") {
        await saveJob({
          ...stale,
          status: "failed",
          finished_at_utc: now.toISOString(),
          error: { code: "interrupted", message: "The server stopped while the job was running." },
        });
      }
    }

    const provider = synthesisProvider();
    const job = await saveJob({
      job_id: newId("job", now),
      session_id: sid,
      kind: "synthesis",
      status: "queued",
      module: provider.info,
      input_revs: null,
      revision_ids: [],
      created_at_utc: now.toISOString(),
      started_at_utc: null,
      finished_at_utc: null,
      error: null,
      discard_reason: null,
    });
    const done = runJob(job).finally(() => {
      if (active.get(sid)?.job_id === job.job_id) active.delete(sid);
    });
    active.set(sid, { job_id: job.job_id, done });
    return { job_id: job.job_id, created: true, done };
  });
}

// --- run ------------------------------------------------------------------------

type Inputs = Awaited<ReturnType<typeof readInputs>>;

async function readInputs(sid: string) {
  const [session, events, exchanges, entries, confirmations, prior] = await Promise.all([
    getSession(sid),
    listEvents(sid),
    listExchanges(sid),
    listEntries(),
    listSessionConfirmations(sid),
    listAllRevisions(),
  ]);
  const revs: JobInputRevs = {
    event_ids: events.map(e => e.event_id).sort(),
    exchanges: Object.fromEntries(exchanges.map(x => [x.exchange_id, x.rev])),
    entries: Object.fromEntries(entries.map(e => [e.entry_id, e.current_revision_id])),
    confirmation_ids: confirmations.map(c => c.confirmation_id).sort(),
    generation: session.generation ?? 0,
  };
  return { session, events, exchanges, confirmations, prior, revs };
}

/** First input that changed or disappeared since the snapshot; additions don't count. */
function inputChange(before: JobInputRevs, now: JobInputRevs): string | null {
  // S4: any deletion cascade or off-record purge on this session bumps its generation.
  if ((before.generation ?? 0) !== (now.generation ?? 0)) return `generation_changed:${before.generation ?? 0}->${now.generation ?? 0}`;
  const events = new Set(now.event_ids);
  for (const id of before.event_ids) if (!events.has(id)) return `event_deleted:${id}`;
  for (const [id, rev] of Object.entries(before.exchanges)) {
    if (now.exchanges[id] === undefined) return `exchange_deleted:${id}`;
    if (now.exchanges[id] !== rev) return `exchange_changed:${id}`;
  }
  for (const [id, rev] of Object.entries(before.entries)) {
    if (now.entries[id] !== rev) return `entry_changed:${id}`;
  }
  const confirmations = new Set(now.confirmation_ids);
  if (now.confirmation_ids.length !== before.confirmation_ids.length || before.confirmation_ids.some(id => !confirmations.has(id))) {
    return "confirmations_changed";
  }
  return null;
}

const ASSET_REF = /^\/api\/assets\/([a-z0-9][a-z0-9-]{0,63})\/(original|highlighted)$/;

function makeHost(assets: Map<string, EvidenceAsset>, prior: KnowledgeRevision[]): SynthesisHost {
  return {
    async loadMarkdown(rev) {
      const known = prior.find(p => p.revision_id === rev.revision_id) ?? rev;
      return (await readRevisionByNo(known.entry_id, known.revision_no).catch(() => null))?.markdown ?? null;
    },
    imageRef(ref) {
      const m = ASSET_REF.exec(ref);
      const asset = m ? assets.get(m[1]) : undefined;
      const file = asset && (m?.[2] === "original" ? asset.original : asset.highlighted);
      // entries/<entry_id>/rev-<n>.md → ../../images/<aid>/<file>
      return file && m ? `../../images/${m[1]}/${file.path}` : ref;
    },
  };
}

/** Checks the module output against the snapshot; never trusts a module with references. */
function checkOutput(out: SynthesisOutput, inputs: Inputs, assets: Map<string, EvidenceAsset>, sid: string): void {
  const events = new Set(inputs.revs.event_ids);
  const exchanges = new Set(Object.keys(inputs.revs.exchanges));
  const seen = new Set<string>();
  for (const r of out.revisions) {
    if (!isValidId(r.entry_id)) throw new JobFailure("invalid_output", "Module returned an invalid entry_id.");
    if (seen.has(r.entry_id)) throw new JobFailure("invalid_output", "Module returned one entry twice.");
    seen.add(r.entry_id);
    if (typeof r.markdown !== "string" || !ProducedBySchema.safeParse(r.produced_by).success) {
      throw new JobFailure("invalid_output", "Module returned a malformed revision.");
    }
    const ev = r.evidence;
    if (!ev.event_ids.every(id => events.has(id)) || !ev.exchange_ids.every(id => exchanges.has(id))) {
      throw new JobFailure("dangling_reference", "Module referenced an event or exchange not in its input.");
    }
    if (!ev.asset_ids.every(id => assets.get(id)?.status === "stored" && assets.get(id)?.session_id === sid)) {
      throw new JobFailure("dangling_reference", "Module referenced an asset that is not stored for this session.");
    }
  }
  if (typeof out.workflow_markdown !== "string" || !out.gaps.every(gap => GapSchema.safeParse(gap).success)) {
    throw new JobFailure("invalid_output", "Module returned a malformed workflow or gap list.");
  }
}

/** Maps a module's `rev-<n>` (WS5 numbering) to the WS6 revision ID; WS6 IDs pass through. */
function mapRef(ref: KnowledgeRef, byNo: Map<string, string>): KnowledgeRef | null {
  const m = /^rev-([1-9]\d*)$/.exec(ref.revision_id);
  if (!m) return ref;
  const id = byNo.get(`${ref.entry_id}#${m[1]}`);
  return id ? { entry_id: ref.entry_id, revision_id: id } : null;
}

async function finish(job: Job, patch: Partial<Job>, now = new Date()): Promise<Job> {
  const saved = await saveJob({ ...job, ...patch, finished_at_utc: now.toISOString() });
  const type = { done: "synthesis.done", failed: "synthesis.failed", discarded: "synthesis.discarded" }[
    saved.status as "done" | "failed" | "discarded"
  ];
  await appendBus(saved.session_id, type, saved.revision_ids.length ? { job_id: saved.job_id, revision_ids: saved.revision_ids } : { job_id: saved.job_id });
  return saved;
}

async function runJob(queued: Job): Promise<Job> {
  const sid = queued.session_id;
  const started = performance.now();
  let job = queued;
  try {
    const inputs = await withSessionLock(sid, () => readInputs(sid));
    job = await saveJob({ ...job, status: "running", input_revs: inputs.revs, started_at_utc: new Date().toISOString() });
    await appendBus(sid, "synthesis.started", { job_id: job.job_id });

    const assets = new Map<string, EvidenceAsset>();
    for (const e of inputs.events) {
      if (e.asset_id && !assets.has(e.asset_id)) {
        const a = await loadAssetMeta(e.asset_id).catch(() => null);
        if (a) assets.set(e.asset_id, a);
      }
    }

    const module = synthesisProvider().create(makeHost(assets, inputs.prior));
    let out: SynthesisOutput;
    try {
      out = await module.synthesize({
        session: inputs.session,
        events: inputs.events,
        exchanges: inputs.exchanges,
        prior: inputs.prior,
        confirmations: inputs.confirmations.map(toExpertConfirmation),
      });
    } catch {
      throw new JobFailure("module_error", "The synthesis module failed.");
    }
    checkOutput(out, inputs, assets, sid);

    const result = await withSessionLock(sid, () =>
      withKnowledgeLock(async () => {
        const now = new Date();
        const change = inputChange(inputs.revs, (await readInputs(sid)).revs);
        if (change) return { discarded: change } as const;

        const plans: RevisionPlan[] = [];
        for (const r of out.revisions) {
          plans.push(
            await planRevision(
              {
                entry_id: r.entry_id,
                markdown: r.markdown,
                evidence: r.evidence,
                produced_by: r.produced_by,
                change_reason: r.change_reason,
                session_id: sid,
                revision_no: r.revision_no,
                parent_revision_id: r.parent_revision_id,
              },
              now,
            ),
          );
        }
        for (const p of plans) if (p.kind === "new") await commitRevision(p, now);

        const byNo = new Map(plans.map(p => [`${p.revision.entry_id}#${p.revision.revision_no}`, p.revision.revision_id]));
        for (const r of await listAllRevisions()) byNo.set(`${r.entry_id}#${r.revision_no}`, r.revision_id);

        const linkage = await writeWorkflow({ markdown: out.workflow_markdown, produced_by: job.module, session_id: sid, job_id: job.job_id }, now);
        const reviewed = out.teach_back_reviewed
          ? out.teach_back_reviewed.map(ref => mapRef(ref, byNo)).filter((r): r is KnowledgeRef => r !== null)
          : linkage.links.flatMap(l => (l.revision_id ? [{ entry_id: l.entry_id, revision_id: l.revision_id }] : []));
        const flagged = (out.flagged_for_reconfirmation ?? []).flatMap(f => {
          const ref = mapRef(f, byNo);
          return ref ? [{ ...ref, reason: f.reason }] : [];
        });

        const produced_by: ModuleInfo = job.module;
        await writeJsonAtomic(
          gapsFile(sid),
          GapsViewSchema.parse({ session_id: sid, job_id: job.job_id, produced_by, gaps: out.gaps, updated_at_utc: now.toISOString() }),
        );
        const draft = SessionDraftViewSchema.parse({
          session_id: sid,
          job_id: job.job_id,
          produced_by,
          revision_ids: reviewed.map(r => r.revision_id),
          reviewed,
          teach_back: out.teach_back,
          flagged_for_reconfirmation: flagged,
          updated_at_utc: now.toISOString(),
        });
        await writeJsonAtomic(draftFile(sid), draft);
        return { created: plans.filter(p => p.kind === "new").map(p => p.revision), draft } as const;
      }),
    );

    if ("discarded" in result) {
      job = await finish(job, { status: "discarded", discard_reason: result.discarded ?? null });
    } else {
      for (const r of result.created) {
        await appendBus(sid, "revision.created", { entry_id: r.entry_id, revision_id: r.revision_id });
      }
      job = await finish(job, { status: "done", revision_ids: result.created.map(r => r.revision_id) });
      await appendBus(sid, "draft.updated", { revision_ids: result.draft.revision_ids });
      await appendBus(sid, "gaps.updated", {});
    }
  } catch (err) {
    const failure =
      err instanceof JobFailure
        ? err
        : err instanceof RevisionConflictError
          ? new JobFailure("revision_conflict", "Module revision numbering does not follow the store.")
          : new JobFailure("internal", "Synthesis job failed.");
    job = await finish(job, { status: "failed", error: { code: failure.code, message: failure.message } }).catch(() => job);
  }
  await diag({
    component: "synthesis",
    op: "job",
    ids: { session_id: sid, job_id: job.job_id },
    outcome: job.status === "done" ? "ok" : "error",
    duration_ms: performance.now() - started,
  });
  return job;
}
