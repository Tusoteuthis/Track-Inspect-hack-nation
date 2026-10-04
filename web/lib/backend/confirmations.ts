/** Confirmation store: `knowledge/confirmations/<confirmation_id>.json` (immutable). */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ConfirmationSchema, type Confirmation } from "@/lib/contracts";
import type { ExpertConfirmation } from "@/lib/expert/contracts";
import { getConfig } from "./config";
import { isValidId, safeJoin } from "./ids";
import { readJson } from "./store";

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
