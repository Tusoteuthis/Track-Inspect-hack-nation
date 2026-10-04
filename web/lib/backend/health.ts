import { constants, promises as fs } from "node:fs";
import { SCHEMA_VERSION, type ModuleInfo } from "@/lib/contracts";
import { getConfig } from "./config";
import { activeModules } from "./modules";

export type HealthReport = {
  ok: boolean;
  schema_version: typeof SCHEMA_VERSION;
  knowledge_dir_writable: boolean;
  runtime_dir_writable: boolean;
  /** Active partner-module implementations, e.g. `{ synthesis: { id, version, source } }`. */
  modules: Record<string, ModuleInfo>;
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
    modules: activeModules(),
  };
}
