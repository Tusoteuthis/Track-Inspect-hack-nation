import { constants, promises as fs } from "node:fs";
import { SCHEMA_VERSION, type ModuleInfo } from "@/lib/contracts";
import { configuredAccessToken } from "./access";
import { getConfig } from "./config";
import { componentStatuses, failingComponents, readDiagLines, type ComponentStatus } from "./diagnostics";
import { activeModules } from "./modules";

export type HealthReport = {
  ok: boolean;
  schema_version: typeof SCHEMA_VERSION;
  knowledge_dir_writable: boolean;
  runtime_dir_writable: boolean;
  /** Active partner-module implementations: `{ synthesis, tutor, assessment }` → `{ id, version, source }`. */
  modules: Record<string, ModuleInfo>;
  /** S4: whether the ElevenLabs key and agent IDs are present (never their values). */
  elevenlabs: { api_key_configured: boolean; expert_agent_configured: boolean; tutor_agent_configured: boolean };
  /** S4: whether `/api/*` requires the demo access token. */
  access_token_required: boolean;
  /** S4: per component (from the diag log): request/error counts, last success, last error. */
  components: Record<string, ComponentStatus>;
  /** S4: components whose latest outcome is a server-side or module failure. */
  failing_components: string[];
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

const present = (name: string) => Boolean(process.env[name]?.trim());

export async function checkHealth(): Promise<HealthReport> {
  const { knowledgeDir, runtimeDir } = getConfig();
  const [knowledge, runtime] = await Promise.all([isWritableDir(knowledgeDir), isWritableDir(runtimeDir)]);
  const components = componentStatuses(await readDiagLines().catch(() => []));
  return {
    ok: knowledge && runtime,
    schema_version: SCHEMA_VERSION,
    knowledge_dir_writable: knowledge,
    runtime_dir_writable: runtime,
    modules: activeModules(),
    elevenlabs: {
      api_key_configured: present("ELEVENLABS_API_KEY"),
      expert_agent_configured: present("ELEVENLABS_AGENT_ID_EXPERT"),
      tutor_agent_configured: present("ELEVENLABS_AGENT_ID_TUTOR"),
    },
    access_token_required: configuredAccessToken() !== null,
    components,
    failing_components: failingComponents(components),
  };
}
