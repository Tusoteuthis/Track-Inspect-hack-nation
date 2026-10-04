/** Confirmation store: `knowledge/confirmations/<confirmation_id>.json` (immutable). */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ConfirmationSchema, parseConfirmationPost, type Confirmation, type KnowledgeRevision } from "@/lib/contracts";
import type { ExpertConfirmation } from "@/lib/expert/contracts";
import { nextStatus } from "@/lib/knowledge";
import { appendBus } from "./bus";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { getExchange } from "./exchanges";
import { isValidId, newId, safeJoin } from "./ids";
import { appendStatusTransition, findRevision, loadEntry, revisionStatus, withKnowledgeLock } from "./knowledge";
import { canonicalJson, readJson, writeJsonAtomic } from "./store";

const confirmationsDir = () => path.join(getConfig().knowledgeDir, "confirmations");
export const confirmationFile = (id: string) => safeJoin(confirmationsDir(), id) + ".json";

export async function listConfirmations(): Promise<Confirmation[]> {
  let files: string[];
  try {
    files = await fs.readdir(confirmationsDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Confirmation[] = [];
  for (const f of files.sort()) {
    const id = f.endsWith(".json") ? f.slice(0, -5) : "";
    if (!isValidId(id)) continue;
    const c = await readJson(confirmationFile(id), ConfirmationSchema);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.at_utc.localeCompare(b.at_utc) || a.confirmation_id.localeCompare(b.confirmation_id));
}

export async function listSessionConfirmations(sid: string): Promise<Confirmation[]> {
  return (await listConfirmations()).filter(c => c.session_id === sid);
}

/** WS3 shape, as WS5 synthesis expects it (`revision_id` is the WS6 revision ID). */
export function toExpertConfirmation(c: Confirmation): ExpertConfirmation {
  return {
    confirmation_id: c.confirmation_id,
    revision_id: c.reviewed_revision_id,
    status: c.result,
    step_ids_reviewed: [...(c.step_ids_reviewed ?? [])],
    expert_response_exchange_id: c.expert_response_exchange_id,
    at_utc: c.at_utc,
  };
}

// --- POST /api/knowledge/confirmations ------------------------------------------------

type Normalized = {
  key: string;
  reviewed_revision_ids: string[];
  result: Confirmation["result"];
  expert_response_exchange_id: string;
  step_ids_reviewed: string[] | null;
  /** WS3 form: the producer's own id and time. */
  confirmation_id: string | null;
  at_utc: string | null;
};

const IdempotencyRecordSchema = z.object({ request_sha256: z.string(), confirmations: z.array(ConfirmationSchema) });

const idempotencyFile = (key: string) =>
  path.join(getConfig().runtimeDir, "idempotency", "confirmations", `${createHash("sha256").update(key).digest("hex")}.json`);

function normalize(body: unknown): Normalized {
  const parsed = parseConfirmationPost(body);
  if (!parsed.ok) throw new ApiError("validation_failed", parsed.error.message, { issues: parsed.error.issues });
  const v = parsed.value;
  if ("confirmation_id" in v) {
    return {
      key: `ws3:${v.confirmation_id}`,
      reviewed_revision_ids: [v.revision_id],
      result: v.status,
      expert_response_exchange_id: v.expert_response_exchange_id,
      step_ids_reviewed: [...v.step_ids_reviewed],
      confirmation_id: v.confirmation_id,
      at_utc: v.at_utc,
    };
  }
  return {
    key: `ws6:${v.idempotency_key}`,
    reviewed_revision_ids: [...new Set(v.reviewed_revision_ids)],
    result: v.result,
    expert_response_exchange_id: v.expert_response_exchange_id,
    step_ids_reviewed: v.step_ids_reviewed ? [...new Set(v.step_ids_reviewed)].sort() : null,
    confirmation_id: null,
    at_utc: null,
  };
}

const invalid = (reason: string, message: string, details: Record<string, unknown> = {}) =>
  new ApiError("validation_failed", message, { reason, ...details });

/** Writes whatever of a planned confirmation set is missing (files, then status transitions). */
async function applyConfirmations(planned: Confirmation[], now: Date): Promise<void> {
  for (const c of planned) {
    const file = confirmationFile(c.confirmation_id);
    if (await readJson(file, ConfirmationSchema)) continue;
    await writeJsonAtomic(file, c);
    const found = await findRevision(c.reviewed_revision_id);
    if (!found) continue;
    const t = nextStatus(await revisionStatus(found.revision), { type: "confirmation", result: c.result });
    if (t.ok) await appendStatusTransition({ revision: found.revision, to: t.status, confirmation_id: c.confirmation_id }, now);
  }
}

/**
 * Stores the expert's teach-back response against the exact revisions reviewed. Everything is
 * checked under the knowledge lock, so no revision can become current or stale in between.
 */
export async function postConfirmation(
  body: unknown,
  now: Date = new Date(),
): Promise<{ status: 200 | 201; confirmations: Confirmation[] }> {
  const req = normalize(body);
  const { key: _key, ...fingerprint } = req;
  const requestSha = createHash("sha256").update(canonicalJson(fingerprint)).digest("hex");

  const result = await withKnowledgeLock(async () => {
    const replay = await readJson(idempotencyFile(req.key), IdempotencyRecordSchema);
    if (replay) {
      if (replay.request_sha256 !== requestSha) {
        throw new ApiError("conflict_immutable", "This idempotency key was used for a different confirmation.");
      }
      await applyConfirmations(replay.confirmations, now); // completes a write interrupted by a crash
      return { status: 200 as const, confirmations: replay.confirmations, fresh: false };
    }
    if (req.confirmation_id && (await readJson(confirmationFile(req.confirmation_id), ConfirmationSchema))) {
      throw new ApiError("conflict_immutable", "A different confirmation already exists with this ID.");
    }

    const revisions: KnowledgeRevision[] = [];
    for (const id of req.reviewed_revision_ids) {
      const found = await findRevision(id);
      if (!found) throw new ApiError("not_found", "Reviewed revision not found.", { revision_id: id });
      revisions.push(found.revision);
    }

    // Revision integrity: the expert reviewed exactly these; any newer revision wins, no override.
    const stale: string[] = [];
    const current: string[] = [];
    for (const r of revisions) {
      const entry = await loadEntry(r.entry_id);
      if (entry?.current_revision_id !== r.revision_id) {
        stale.push(r.revision_id);
        if (entry) current.push(entry.current_revision_id);
      }
    }
    if (stale.length) {
      throw new ApiError("stale_revision", "A reviewed revision is no longer current; review the current one.", {
        stale_revision_ids: stale,
        current_revision_ids: [...new Set(current)],
      });
    }

    const sessions = new Set(revisions.map(r => r.session_id ?? null));
    const sid = revisions[0].session_id;
    if (sessions.size !== 1 || !sid) {
      throw invalid("revision_sessions", "Reviewed revisions must come from one expert session.");
    }

    // Silence is never confirmation: the response must be stored, on-record expert words of that session.
    const xid = req.expert_response_exchange_id;
    const exchange = await getExchange(sid, xid).catch((err: unknown) => {
      if (err instanceof ApiError && err.code === "not_found") {
        throw invalid("exchange_not_found", "The expert response exchange is not stored for this session.", { exchange_id: xid });
      }
      throw err;
    });
    if (exchange.record_state !== "on_record") {
      throw invalid("exchange_off_record", "An off-record exchange cannot confirm knowledge.", { exchange_id: xid });
    }
    if (!exchange.answer_lines.some(l => l.text.trim().length > 0)) {
      throw invalid("exchange_no_answer", "The expert response exchange has no answer.", { exchange_id: xid });
    }

    const entryIds = [...new Set(revisions.map(r => r.entry_id))].sort();
    const steps = req.step_ids_reviewed ?? entryIds;
    if (!steps.every(s => entryIds.includes(s))) {
      throw invalid("step_not_reviewed", "step_ids_reviewed must be entries of the reviewed revisions.");
    }

    for (const r of revisions) {
      const t = nextStatus(await revisionStatus(r), { type: "confirmation", result: req.result });
      if (!t.ok) throw new ApiError("invalid_transition", "This revision cannot take that confirmation.", { revision_id: r.revision_id });
    }

    const at = req.at_utc ?? now.toISOString();
    const planned: Confirmation[] = revisions.map(r => ({
      confirmation_id: req.confirmation_id ?? newId("cnf", now),
      reviewed_revision_id: r.revision_id,
      result: req.result,
      expert_response_exchange_id: xid,
      at_utc: at,
      step_ids_reviewed: steps,
      source: exchange.source,
      session_id: sid,
      entry_id: r.entry_id,
    }));
    // The plan is recorded before any confirmation file, so a crash is completed by the replay.
    await writeJsonAtomic(idempotencyFile(req.key), { request_sha256: requestSha, confirmations: planned });
    await applyConfirmations(planned, now);
    return { status: 201 as const, confirmations: planned, fresh: true };
  });

  if (result.fresh) {
    const sid = result.confirmations[0].session_id;
    if (sid) {
      await appendBus(sid, "confirmation.stored", {
        confirmation_ids: result.confirmations.map(c => c.confirmation_id),
        revision_ids: result.confirmations.map(c => c.reviewed_revision_id),
      });
    }
  }
  return { status: result.status, confirmations: result.confirmations };
}
