import { existsSync } from "node:fs";
import path from "node:path";

export type BackendConfig = {
  knowledgeDir: string;
  runtimeDir: string;
  evaluatorDir: string;
  /** Learner-visible cases (WS4). Never inside `evaluatorDir`. */
  casesDir: string;
  /** Per-file cap for evidence uploads (ASSET_MAX_BYTES, default 15 MiB). */
  assetMaxBytes: number;
};

const DEFAULT_ASSET_MAX_BYTES = 15 * 1024 * 1024;

let cached: BackendConfig | null = null;

function resolveConfig(): BackendConfig {
  // `next dev` and vitest both run from web/; import.meta.url is unreliable inside the Next bundle.
  const webDir = process.cwd();
  const fromEnv = (name: string, fallback: string) =>
    path.resolve(webDir, process.env[name]?.trim() || fallback);

  const knowledgeDir = fromEnv("KNOWLEDGE_DIR", "../knowledge");
  const runtimeDir = fromEnv("RUNTIME_DIR", ".runtime");
  const evaluatorDir = fromEnv("EVALUATOR_DIR", path.join(runtimeDir, "evaluator"));
  // WS4's cases when present, else the labelled WS6 fixture cases (every record says source: "fixture").
  const repoCases = path.resolve(webDir, "../cases/learner");
  const casesDir = fromEnv("CASES_DIR", existsSync(repoCases) ? repoCases : "fixtures/ws6/cases");
  const cap = Number(process.env.ASSET_MAX_BYTES?.trim());
  const assetMaxBytes = Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_ASSET_MAX_BYTES;
  return { knowledgeDir, runtimeDir, evaluatorDir, casesDir, assetMaxBytes };
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
