/**
 * Learner-visible cases (WS4) from `CASES_DIR/<case_id>/case.json` + trace image. Only the learner
 * view is ever returned or handed to a module; a case file carrying anything else is unusable.
 */
import path from "node:path";
import { CaseFileSchema, type CaseFile, type LearnerCase } from "@/lib/contracts";
import { assertNoEvaluatorMaterial } from "@/lib/knowledge";
import { ApiError } from "./errors";
import { assertSafeId, isValidId } from "./ids";
import { sniffImage } from "./image-info";
import { caseDir, casesRoot } from "./paths";
import { getBlobStore } from "./blobstore";

const unavailable = (caseId: string, reason: string) =>
  new ApiError("not_found", "Case not available.", { case_id: caseId, reason });

const realpathOrNull = (p: string) => getBlobStore().realpath(p).catch(() => null);

export async function loadCaseFile(caseId: string): Promise<CaseFile> {
  assertSafeId(caseId, "case_id");
  let raw: unknown;
  try {
    const text = await getBlobStore().getText(path.join(caseDir(caseId), "case.json"));
    if (text === null) throw unavailable(caseId, "missing");
    raw = JSON.parse(text);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw unavailable(caseId, "unreadable");
  }
  try {
    assertNoEvaluatorMaterial(raw);
  } catch {
    throw unavailable(caseId, "evaluator_material");
  }
  const parsed = CaseFileSchema.safeParse(raw);
  if (!parsed.success || parsed.data.case_id !== caseId) throw unavailable(caseId, "invalid");
  return parsed.data;
}

async function readTrace(file: CaseFile): Promise<{ bytes: Buffer; mime: "image/png" | "image/jpeg"; width_px: number; height_px: number }> {
  const root = await realpathOrNull(casesRoot());
  const real = await realpathOrNull(path.join(caseDir(file.case_id), file.trace_asset));
  if (!root || !real || !real.startsWith(root + path.sep)) throw unavailable(file.case_id, "trace_missing");
  const read = await getBlobStore().getBytes(real).catch(() => null);
  const bytes = read && Buffer.from(read.buffer, read.byteOffset, read.byteLength);
  const info = bytes && sniffImage(bytes);
  if (!bytes || !info) throw unavailable(file.case_id, "trace_unreadable");
  return { bytes, mime: info.mime, width_px: info.width_px, height_px: info.height_px };
}

export async function getLearnerCase(caseId: string): Promise<LearnerCase> {
  const file = await loadCaseFile(caseId);
  const trace = await readTrace(file);
  return {
    case_id: file.case_id,
    title: file.title,
    shown_to_expert: file.shown_to_expert,
    source: file.source,
    visible_context: [...file.visible_context],
    decision_options: file.decision_options && [...file.decision_options],
    trace: { url: `/api/cases/${file.case_id}/trace`, mime: trace.mime, width_px: trace.width_px, height_px: trace.height_px },
  };
}

export async function caseTraceResponse(caseId: string): Promise<Response> {
  const trace = await readTrace(await loadCaseFile(caseId));
  return new Response(new Uint8Array(trace.bytes), {
    headers: {
      "Content-Type": trace.mime,
      "Content-Length": String(trace.bytes.byteLength),
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function listCaseIds(): Promise<string[]> {
  const entries = await getBlobStore().list(casesRoot()).catch(() => []);
  return entries.filter(e => e.isDir && isValidId(e.name)).map(e => e.name).sort();
}

/** `GET /api/cases` (integration G7): every usable case as its learner view; unusable files are skipped. */
export async function listLearnerCases(audience?: "expert" | "newcomer"): Promise<LearnerCase[]> {
  const out: LearnerCase[] = [];
  for (const id of await listCaseIds()) {
    const view = await getLearnerCase(id).catch(() => null);
    if (!view) continue;
    if (audience === "expert" && !view.shown_to_expert) continue;
    if (audience === "newcomer" && view.shown_to_expert) continue;
    out.push(view);
  }
  return out;
}

/**
 * The expert's case (integration G8): only a case marked `shown_to_expert`. Every other case is
 * reserved for newcomers, who must practise on a case the expert did not explain.
 */
export async function pickExpertCase(caseId: string): Promise<CaseFile> {
  const file = await loadCaseFile(caseId);
  if (!file.shown_to_expert) {
    throw new ApiError("case_not_permitted", "This case is reserved for newcomers; the expert needs a case marked shown_to_expert.", {
      case_id: caseId,
      reason: "not_shown_to_expert",
    });
  }
  return file;
}

/**
 * The newcomer's case: the requested one if it was not shown to the expert, otherwise the first
 * usable unseen case. Unusable case files are skipped when picking.
 */
export async function pickNewcomerCase(caseId: string | null): Promise<CaseFile> {
  if (caseId !== null) {
    const file = await loadCaseFile(caseId);
    if (file.shown_to_expert) {
      throw new ApiError("case_not_permitted", "This case was shown to the expert; a newcomer needs an unseen case.", {
        case_id: caseId,
        reason: "shown_to_expert",
      });
    }
    return file;
  }
  for (const id of await listCaseIds()) {
    const file = await loadCaseFile(id).catch(() => null);
    if (file && !file.shown_to_expert) return file;
  }
  throw new ApiError("case_not_permitted", "No unseen case is available.", { reason: "no_unseen_case" });
}
