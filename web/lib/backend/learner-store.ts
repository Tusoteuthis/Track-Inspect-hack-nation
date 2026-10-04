/** Learner files: `knowledge/learner/<sid>/{draft.json, drafts/<rev>.json, evaluations/<eid>.json, commit.json}`. */
import path from "node:path";
import { CommitSchema, EvaluationSchema, LearnerDraftSchema, type Commit, type Evaluation, type LearnerDraft } from "@/lib/contracts";
import { isValidId, safeJoin } from "./ids";
import { learnerDir } from "./paths";
import { readJson } from "./store";
import { listNames } from "./blobstore";

export const draftFile = (sid: string) => path.join(learnerDir(sid), "draft.json");
export const draftHistoryFile = (sid: string, rev: number) => path.join(learnerDir(sid), "drafts", `${rev}.json`);
export const evaluationsDir = (sid: string) => path.join(learnerDir(sid), "evaluations");
export const evaluationFile = (sid: string, eid: string) => safeJoin(evaluationsDir(sid), eid) + ".json";
export const commitFile = (sid: string) => path.join(learnerDir(sid), "commit.json");

export function loadDraft(sid: string): Promise<LearnerDraft | null> {
  return readJson(draftFile(sid), LearnerDraftSchema);
}

/** Every stored draft revision, oldest first. */
export async function listDrafts(sid: string): Promise<LearnerDraft[]> {
  const names = await listNames(path.join(learnerDir(sid), "drafts")).catch(() => [] as string[]);
  const revs = names.map(n => /^([1-9]\d*)\.json$/.exec(n)?.[1]).filter((n): n is string => !!n).map(Number).sort((a, b) => a - b);
  const out: LearnerDraft[] = [];
  for (const rev of revs) {
    const d = await readJson(draftHistoryFile(sid, rev), LearnerDraftSchema);
    if (d) out.push(d);
  }
  return out;
}

export function loadEvaluation(sid: string, eid: string): Promise<Evaluation | null> {
  return readJson(evaluationFile(sid, eid), EvaluationSchema);
}

/** All evaluations of a session, oldest first. */
export async function listEvaluations(sid: string): Promise<Evaluation[]> {
  const names = await listNames(evaluationsDir(sid)).catch(() => [] as string[]);
  const out: Evaluation[] = [];
  for (const n of names) {
    const id = n.endsWith(".json") ? n.slice(0, -5) : "";
    if (!isValidId(id)) continue;
    const e = await loadEvaluation(sid, id);
    if (e) out.push(e);
  }
  return out.sort((a, b) => a.created_at_utc.localeCompare(b.created_at_utc) || a.evaluation_id.localeCompare(b.evaluation_id));
}

export function loadCommit(sid: string): Promise<Commit | null> {
  return readJson(commitFile(sid), CommitSchema);
}
