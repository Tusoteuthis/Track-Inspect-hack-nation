/** Job records in `RUNTIME_DIR/jobs/<job_id>.json` (IDs, statuses and error codes only). */
import { promises as fs } from "node:fs";
import path from "node:path";
import { JobSchema, type Job } from "@/lib/contracts";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { assertSafeId, isValidId, safeJoin } from "./ids";
import { readJson, writeJsonAtomic } from "./store";

const jobsDir = () => path.join(getConfig().runtimeDir, "jobs");
const jobFile = (jobId: string) => safeJoin(jobsDir(), jobId) + ".json";

export async function saveJob(job: Job): Promise<Job> {
  const parsed = JobSchema.parse(job);
  await writeJsonAtomic(jobFile(parsed.job_id), parsed);
  return parsed;
}

export async function loadJob(jobId: string): Promise<Job | null> {
  assertSafeId(jobId, "job_id");
  return readJson(jobFile(jobId), JobSchema);
}

export async function getJob(jobId: string): Promise<Job> {
  const job = await loadJob(jobId);
  if (!job) throw new ApiError("not_found", "Job not found.", { job_id: jobId });
  return job;
}

export async function listSessionJobs(sid: string): Promise<Job[]> {
  let files: string[];
  try {
    files = await fs.readdir(jobsDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Job[] = [];
  for (const f of files) {
    const id = f.endsWith(".json") ? f.slice(0, -5) : "";
    if (!isValidId(id)) continue;
    const job = await loadJob(id).catch(() => null);
    if (job?.session_id === sid) out.push(job);
  }
  return out.sort((a, b) => a.created_at_utc.localeCompare(b.created_at_utc));
}
