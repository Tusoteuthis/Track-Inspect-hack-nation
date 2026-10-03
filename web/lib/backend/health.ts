import { constants, promises as fs } from "node:fs";
import { getConfig } from "./config";

// Will be imported from @/lib/contracts after the lanes merge.
const SCHEMA_VERSION = "ws6.v0";

export type HealthReport = {
  ok: boolean;
  schema_version: typeof SCHEMA_VERSION;
  knowledge_dir_writable: boolean;
  runtime_dir_writable: boolean;
  modules: Record<string, never>;
};

async function isWritableDir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const { knowledgeDir, runtimeDir } = getConfig();
  const [knowledge, runtime] = await Promise.all([isWritableDir(knowledgeDir), isWritableDir(runtimeDir)]);
  return {
    ok: knowledge && runtime,
    schema_version: SCHEMA_VERSION,
    knowledge_dir_writable: knowledge,
    runtime_dir_writable: runtime,
    modules: {},
  };
}
