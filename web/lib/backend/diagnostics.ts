/**
 * Diagnostics (S4): the ID chain of one session across components, plus per-component last
 * error from the diag log. IDs, statuses, timestamps and error codes only — never content.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ErrorCode } from "@/lib/contracts";
import { getConfig } from "./config";
import { listSessionConfirmations, listConfirmations } from "./confirmations";
import type { DiagLine } from "./diag";
import { listEvents } from "./events";
import { listExchanges } from "./exchanges";
import { assertSafeId, isValidId } from "./ids";
import { listSessionJobs } from "./jobs";
import { listAllRevisions, revisionStatus } from "./knowledge";
import { listEvaluations, loadCommit } from "./learner-store";
import { sessionDir } from "./paths";
import { getSession, loadSession } from "./sessions";

const DIAG_DAYS = 2;

/** The diag lines of the last `DIAG_DAYS` files, oldest first. Torn lines are skipped. */
export async function readDiagLines(): Promise<DiagLine[]> {
  const dir = path.join(getConfig().runtimeDir, "diag");
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort().slice(-DIAG_DAYS);
  const out: DiagLine[] = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as DiagLine);
      } catch {
        // skip
      }
    }
  }
  return out;
}

export type ComponentStatus = {
  requests: number;
  errors: number;
  last_ok_at_utc: string | null;
  last_error: { at_utc: string; op: string | null; error_code: ErrorCode | null; ids: Record<string, string> } | null;
};

/** Server-side failures (5xx-class) are what "a component failed" means; 4xx are client mistakes. */
const SERVER_FAILURES = new Set<ErrorCode>(["internal"]);

export function componentStatuses(lines: readonly DiagLine[]): Record<string, ComponentStatus> {
  const out: Record<string, ComponentStatus> = {};
  for (const l of lines) {
    const c = l.component ?? "unknown";
    const s = (out[c] ??= { requests: 0, errors: 0, last_ok_at_utc: null, last_error: null });
    s.requests += 1;
    if (l.outcome === "ok") s.last_ok_at_utc = l.at_utc;
    else if (l.outcome === "error") {
      s.errors += 1;
      s.last_error = { at_utc: l.at_utc, op: l.op ?? null, error_code: l.error_code ?? null, ids: l.ids };
    }
  }
  return out;
}

/** Components whose most recent outcome was a server-side failure (or a module failure). */
export function failingComponents(statuses: Record<string, ComponentStatus>): string[] {
  return Object.entries(statuses)
    .filter(([, s]) => s.last_error && (s.last_ok_at_utc === null || s.last_error.at_utc >= s.last_ok_at_utc))
    .filter(([c, s]) => SERVER_FAILURES.has(s.last_error!.error_code ?? "internal") || c === "synthesis" || c === "evaluations")
    .map(([c]) => c)
    .sort();
}

async function newcomerChain(sid: string) {
  const session = await getSession(sid);
  const [evaluations, commit] = await Promise.all([listEvaluations(sid), loadCommit(sid)]);
  return {
    session_id: sid,
    lifecycle: session.lifecycle,
    case_id: session.case_id,
    generation: session.generation ?? 0,
    pinned: session.pinned_knowledge ?? [],
    evaluations: evaluations.map(e => ({
      evaluation_id: e.evaluation_id,
      draft_rev: e.draft_rev,
      status: e.status,
      outcome: e.outcome,
      stale_reason: e.stale_reason ?? null,
      error_code: e.error_code ?? null,
      knowledge_revision_ids: e.knowledge_revision_ids,
      created_at_utc: e.created_at_utc,
      completed_at_utc: e.completed_at_utc ?? null,
      produced_by: e.produced_by,
    })),
    commit: commit && { commit_id: commit.commit_id, evaluation_id: commit.evaluation_id, draft_rev: commit.draft_rev, at_utc: commit.at_utc, escalated: commit.escalated ?? false },
  };
}

async function listSessionIds(): Promise<string[]> {
  const root = path.dirname(sessionDir("x"));
  return (await fs.readdir(root).catch(() => [] as string[])).filter(isValidId).sort();
}

/** For an expert session: event → exchanges → revisions → confirmations → newcomer sessions → evaluations → commit. */
async function expertChain(sid: string) {
  const [events, exchanges, revisions, confirmations, jobs] = await Promise.all([
    listEvents(sid),
    listExchanges(sid),
    listAllRevisions(),
    listSessionConfirmations(sid),
    listSessionJobs(sid),
  ]);
  const own = revisions.filter(r => r.session_id === sid);
  const statusOf = new Map<string, string>();
  for (const r of own) statusOf.set(r.revision_id, await revisionStatus(r));

  const newcomers: Awaited<ReturnType<typeof newcomerChain>>[] = [];
  for (const id of await listSessionIds()) {
    const s = await loadSession(id).catch(() => null);
    if (s?.role !== "newcomer") continue;
    if ((s.pinned_knowledge ?? []).some(p => own.some(r => r.revision_id === p.revision_id))) newcomers.push(await newcomerChain(id));
  }

  return {
    events: events.map(e => {
      const xs = exchanges.filter(x => x.event_id === e.event_id);
      const revs = own.filter(r => r.evidence.event_ids.includes(e.event_id) || r.evidence.exchange_ids.some(id => xs.some(x => x.exchange_id === id)));
      const revIds = new Set(revs.map(r => r.revision_id));
      return {
        event_id: e.event_id,
        asset_id: e.asset_id ?? null,
        captured_at_utc: e.captured_at_utc,
        session_time_ms: e.session_time_ms,
        exchanges: xs.map(x => ({ exchange_id: x.exchange_id, rev: x.rev, phase: x.phase, asked_at_utc: x.asked_at_utc, answer_lines: x.answer_lines.length })),
        revisions: revs.map(r => ({ entry_id: r.entry_id, revision_id: r.revision_id, revision_no: r.revision_no, status: statusOf.get(r.revision_id) ?? r.status, created_at_utc: r.created_at_utc, produced_by: r.produced_by })),
        confirmations: confirmations
          .filter(c => revIds.has(c.reviewed_revision_id))
          .map(c => ({ confirmation_id: c.confirmation_id, revision_id: c.reviewed_revision_id, result: c.result, at_utc: c.at_utc, expert_response_exchange_id: c.expert_response_exchange_id })),
        newcomer_sessions: newcomers
          .filter(n => n.pinned.some(p => revIds.has(p.revision_id)))
          .map(n => ({ ...n, evaluations: n.evaluations.filter(e => e.knowledge_revision_ids.some(id => revIds.has(id))) })),
      };
    }),
    unlinked_exchanges: exchanges.filter(x => x.event_id === null).map(x => ({ exchange_id: x.exchange_id, rev: x.rev, phase: x.phase })),
    jobs: jobs.map(j => ({
      job_id: j.job_id,
      status: j.status,
      module: j.module,
      created_at_utc: j.created_at_utc,
      finished_at_utc: j.finished_at_utc,
      error_code: j.error?.code ?? null,
      discard_reason: j.discard_reason,
      revision_ids: j.revision_ids,
    })),
  };
}

export async function sessionDiagnostics(sid: string) {
  assertSafeId(sid, "session_id");
  const session = await getSession(sid);
  const lines = (await readDiagLines()).filter(l => l.ids.session_id === sid);
  const timeline = lines.slice(-200).map(l => ({ at_utc: l.at_utc, component: l.component ?? null, op: l.op ?? null, outcome: l.outcome ?? null, duration_ms: l.duration_ms ?? null, error_code: l.error_code ?? null, ids: l.ids }));
  const statuses = componentStatuses(lines);
  return {
    session_id: sid,
    role: session.role,
    lifecycle: session.lifecycle,
    record_state: session.record_state,
    generation: session.generation ?? 0,
    generated_at_utc: new Date().toISOString(),
    chain: session.role === "expert" ? await expertChain(sid) : await newcomerChain(sid),
    components: statuses,
    failing_components: failingComponents(statuses),
    timeline,
  };
}

export async function overviewDiagnostics() {
  const statuses = componentStatuses(await readDiagLines());
  const sessions: { session_id: string; role: string; lifecycle: string; created_at_utc: string }[] = [];
  for (const id of await listSessionIds()) {
    const s = await loadSession(id).catch(() => null);
    if (s) sessions.push({ session_id: id, role: s.role, lifecycle: s.lifecycle, created_at_utc: s.created_at_utc });
  }
  return {
    generated_at_utc: new Date().toISOString(),
    sessions: sessions.sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc)),
    confirmations: (await listConfirmations()).length,
    components: statuses,
    failing_components: failingComponents(statuses),
  };
}
