import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig, resetConfig, setConfigForTests } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfig();
});

describe("getConfig", () => {
  it("defaults to absolute paths relative to cwd", () => {
    vi.stubEnv("KNOWLEDGE_DIR", undefined);
    vi.stubEnv("RUNTIME_DIR", undefined);
    vi.stubEnv("EVALUATOR_DIR", undefined);
    resetConfig();
    const cwd = process.cwd();
    const cfg = getConfig();
    expect(cfg.knowledgeDir).toBe(path.resolve(cwd, "..", "knowledge"));
    expect(cfg.runtimeDir).toBe(path.resolve(cwd, ".runtime"));
    expect(cfg.evaluatorDir).toBe(path.resolve(cwd, ".runtime", "evaluator"));
    for (const dir of [cfg.knowledgeDir, cfg.runtimeDir, cfg.evaluatorDir]) expect(path.isAbsolute(dir)).toBe(true);
    expect(cfg.runtimeDir.startsWith(cwd)).toBe(true);
  });

  it("honours env overrides, resolved against cwd", () => {
    vi.stubEnv("KNOWLEDGE_DIR", "/abs/knowledge");
    vi.stubEnv("RUNTIME_DIR", "rel/runtime");
    vi.stubEnv("EVALUATOR_DIR", "/abs/eval");
    vi.stubEnv("ASSET_MAX_BYTES", undefined);
    resetConfig();
    expect(getConfig()).toEqual({
      knowledgeDir: "/abs/knowledge",
      runtimeDir: path.resolve(process.cwd(), "rel/runtime"),
      evaluatorDir: "/abs/eval",
      assetMaxBytes: 15 * 1024 * 1024,
    });
  });

  it("reads ASSET_MAX_BYTES and falls back to 15 MiB on invalid values", () => {
    vi.stubEnv("ASSET_MAX_BYTES", "1024");
    resetConfig();
    expect(getConfig().assetMaxBytes).toBe(1024);
    vi.stubEnv("ASSET_MAX_BYTES", "-5");
    resetConfig();
    expect(getConfig().assetMaxBytes).toBe(15 * 1024 * 1024);
  });

  it("derives evaluatorDir from RUNTIME_DIR when not set", () => {
    vi.stubEnv("RUNTIME_DIR", "/abs/rt");
    vi.stubEnv("EVALUATOR_DIR", undefined);
    resetConfig();
    expect(getConfig().evaluatorDir).toBe("/abs/rt/evaluator");
  });

  it("caches until reset, and supports test overrides", () => {
    const first = getConfig();
    vi.stubEnv("RUNTIME_DIR", "/changed");
    expect(getConfig()).toBe(first);

    setConfigForTests({ knowledgeDir: "/t/k" });
    expect(getConfig().knowledgeDir).toBe("/t/k");
    expect(getConfig().runtimeDir).toBe(first.runtimeDir);

    resetConfig();
    expect(getConfig().runtimeDir).toBe("/changed");
  });
});
