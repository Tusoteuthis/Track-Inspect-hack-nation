import path from "node:path";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { safeJoin } from "./ids";

const isInside = (child: string, parent: string) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * Every directory something is served or read for clients/modules from passes through here.
 * Evaluator-only material (WS4 answer key) must never be reachable, even through misconfiguration.
 */
function servable(dir: string): string {
  const evaluatorDir = getConfig().evaluatorDir;
  if (isInside(dir, evaluatorDir) || isInside(evaluatorDir, dir)) {
    throw new ApiError("not_found", "Not available.");
  }
  return dir;
}

/** `knowledge/sessions/<sid>` (sid validated). */
export function sessionDir(sid: string): string {
  return safeJoin(path.join(getConfig().knowledgeDir, "sessions"), sid);
}

export function sessionFile(sid: string): string {
  return path.join(sessionDir(sid), "session.json");
}

/** `knowledge/sessions/<sid>/<kind>/<id>.json` (both IDs validated). */
export function sessionRecordFile(sid: string, kind: "events" | "exchanges", id: string): string {
  return safeJoin(path.join(sessionDir(sid), kind), id) + ".json";
}

/** The only directory asset bytes are ever served from. */
export function imagesRoot(): string {
  return servable(path.join(getConfig().knowledgeDir, "images"));
}

/** `knowledge/images/<aid>` (aid validated). */
export function assetDir(aid: string): string {
  return safeJoin(imagesRoot(), aid);
}

/** Root of the learner-visible cases (`CASES_DIR`). */
export function casesRoot(): string {
  return servable(getConfig().casesDir);
}

/** `CASES_DIR/<case_id>` (case_id validated). */
export function caseDir(caseId: string): string {
  return safeJoin(casesRoot(), caseId);
}

/** `knowledge/learner/<sid>` — newcomer draft, evaluations and commit. */
export function learnerDir(sid: string): string {
  return safeJoin(path.join(getConfig().knowledgeDir, "learner"), sid);
}

/** `knowledge/assessments` */
export function assessmentsDir(): string {
  return path.join(getConfig().knowledgeDir, "assessments");
}
