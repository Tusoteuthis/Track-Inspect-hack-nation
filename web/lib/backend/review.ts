/**
 * Expert debrief (integration G9/G10): the session review view and review marks.
 *
 * A review mark is a request from the review screen ("correct this", "this is unresolved"). It is
 * stored and announced on the bus for WS3/WS5; it never changes knowledge status. Marks live in
 * the session directory, so deleting the session deletes them.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  ReviewMarkSchema,
  parseReviewMarkRequest,
  type ReviewMark,
  type SessionReviewView,
} from "@/lib/contracts";
import { appendBus } from "./bus";
import { listSessionConfirmations } from "./confirmations";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { assertSafeId, isValidId, newId, safeJoin } from "./ids";
import { findRevision } from "./knowledge";
import { withLock } from "./locks";
import { sessionDir } from "./paths";
import { getSession, requireLiveSession, withSessionLock } from "./sessions";
import { canonicalJson, readJson, writeJsonAtomic } from "./store";
import { getGaps, getSessionDraft } from "./synthesis";
import { getRevisionSteps } from "./workmap";
import { getBlobStore } from "./blobstore";

const marksDir = (sid: string) => path.join(sessionDir(sid), "review-marks");
const markFile = (sid: string, id: string) => safeJoin(marksDir(sid), id) + ".json";

const IdempotencyRecordSchema = z.object({ request_sha256: z.string(), mark: ReviewMarkSchema });
const idempotencyFile = (sid: string, key: string) =>
  path.join(getConfig().runtimeDir, "idempotency", "review-marks", createHash("sha256").update(`${sid}\n${key}`).digest("hex") + ".json");

const invalid = (reason: string, message: string, details: Record<string, unknown> = {}) =>
  new ApiError("validation_failed", message, { reason, ...details });

export async function listReviewMarks(sid: string): Promise<ReviewMark[]> {
  assertSafeId(sid, "session_id");
  const files = (await getBlobStore().list(marksDir(sid))).map((e) => e.name);
  const out: ReviewMark[] = [];
  for (const f of files) {
    const id = f.endsWith(".json") ? f.slice(0, -5) : "";
    if (!isValidId(id)) continue;
    const mark = await readJson(markFile(sid, id), ReviewMarkSchema);
    if (mark) out.push(mark);
  }
  return out.sort((a, b) => a.at_utc.localeCompare(b.at_utc) || a.mark_id.localeCompare(b.mark_id));
}

/** `POST /api/sessions/:sid/review-marks`. Same key + same body → 200 with the stored mark. */
export async function postReviewMark(sid: string, body: unknown, now: Date = new Date()): Promise<{ status: 200 | 201; mark: ReviewMark }> {
  assertSafeId(sid, "session_id");
  const parsed = parseReviewMarkRequest(body);
  if (!parsed.ok) throw new ApiError("validation_failed", parsed.error.message, { issues: parsed.error.issues });
  const { idempotency_key: key, ...req } = parsed.value;
  const requestSha = createHash("sha256").update(canonicalJson(req)).digest("hex");

  const result = await withSessionLock(sid, async () => {
    const session = await requireLiveSession(sid);
    if (session.role !== "expert") throw invalid("not_expert_session", "Review marks belong to expert sessions.");

    const file = idempotencyFile(sid, key);
    return withLock(`idem:${file}`, async () => {
      const replay = await readJson(file, IdempotencyRecordSchema);
      if (replay) {
        if (replay.request_sha256 !== requestSha) {
          throw new ApiError("conflict_immutable", "This idempotency key was used for a different review mark.");
        }
        if (!(await readJson(markFile(sid, replay.mark.mark_id), ReviewMarkSchema))) {
          await writeJsonAtomic(markFile(sid, replay.mark.mark_id), replay.mark); // completes an interrupted write
        }
        return { status: 200 as const, mark: replay.mark };
      }

      const found = await findRevision(req.revision_id);
      if (!found) throw new ApiError("not_found", "Revision not found.", { revision_id: req.revision_id });
      if (found.revision.entry_id !== req.entry_id) {
        throw invalid("entry_mismatch", "The revision does not belong to that entry.", { entry_id: found.revision.entry_id });
      }
      if (found.revision.session_id !== sid) {
        throw invalid("revision_not_in_session", "Review marks name revisions produced in this session.");
      }

      const mark: ReviewMark = { mark_id: newId("mrk", now), session_id: sid, ...req, at_utc: now.toISOString() };
      await writeJsonAtomic(file, { request_sha256: requestSha, mark });
      await writeJsonAtomic(markFile(sid, mark.mark_id), mark);
      return { status: 201 as const, mark };
    });
  });

  if (result.status === 201) {
    const m = result.mark;
    await appendBus(sid, "review_mark.stored", { mark_id: m.mark_id, entry_id: m.entry_id, revision_id: m.revision_id }, now);
  }
  return result;
}

/** `GET /api/sessions/:sid/review` (expert sessions): the debrief view in one response. */
export async function getSessionReview(sid: string): Promise<SessionReviewView> {
  await getSession(sid); // not_found / gone before anything else
  const draft = await getSessionDraft(sid); // not_found for newcomer sessions
  const current = await getRevisionSteps(draft.revision_ids);

  const parentIds: string[] = [];
  for (const step of current.steps) {
    const parent = step.revision_id ? (await findRevision(step.revision_id))?.revision.parent_revision_id : null;
    if (parent && !parentIds.includes(parent)) parentIds.push(parent);
  }
  const previous = await getRevisionSteps(parentIds);

  return {
    session_id: sid,
    job_id: draft.job_id,
    produced_by: draft.produced_by,
    updated_at_utc: draft.updated_at_utc,
    revision_ids: draft.revision_ids,
    current: current.steps,
    // A revoked parent is still history worth showing as "what changed"; only `current` exclusions are reported.
    previous: previous.steps,
    excluded: current.excluded,
    teach_back: draft.teach_back,
    flagged_for_reconfirmation: draft.flagged_for_reconfirmation,
    gaps: (await getGaps(sid)).gaps,
    confirmations: await listSessionConfirmations(sid),
    review_marks: await listReviewMarks(sid),
  };
}
