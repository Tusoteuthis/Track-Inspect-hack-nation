import path from "node:path";

export type BackendConfig = {
  knowledgeDir: string;
  runtimeDir: string;
  evaluatorDir: string;
};

let cached: BackendConfig | null = null;

function resolveConfig(): BackendConfig {
  // `next dev` and vitest both run from web/; import.meta.url is unreliable inside the Next bundle.
  const webDir = process.cwd();
  const fromEnv = (name: string, fallback: string) =>
    path.resolve(webDir, process.env[name]?.trim() || fallback);

  const knowledgeDir = fromEnv("KNOWLEDGE_DIR", "../knowledge");
  const runtimeDir = fromEnv("RUNTIME_DIR", ".runtime");
  const evaluatorDir = fromEnv("EVALUATOR_DIR", path.join(runtimeDir, "evaluator"));
  return { knowledgeDir, runtimeDir, evaluatorDir };
}

export function getConfig(): BackendConfig {
  cached ??= resolveConfig();
  return cached;
}

export function setConfigForTests(partial: Partial<BackendConfig>): void {
  cached = { ...getConfig(), ...partial };
}

export function resetConfig(): void {
  cached = null;
}
