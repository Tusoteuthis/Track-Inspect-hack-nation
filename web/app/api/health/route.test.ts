import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfig, setConfigForTests } from "@/lib/backend/config";
import { GET } from "./route";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-health-"));
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("returns 200 with the exact health shape when dirs are writable", async () => {
    setConfigForTests({
      knowledgeDir: path.join(dir, "knowledge"),
      runtimeDir: path.join(dir, "runtime"),
      evaluatorDir: path.join(dir, "runtime", "evaluator"),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "knowledge_dir_writable",
      "modules",
      "ok",
      "runtime_dir_writable",
      "schema_version",
    ]);
    expect(body).toEqual({
      ok: true,
      schema_version: "ws6.v0",
      knowledge_dir_writable: true,
      runtime_dir_writable: true,
      modules: {
        synthesis: { id: "ws5-synthesis", version: "0.2.0", source: "live" },
        tutor: { id: "ws6-stub-tutor", version: "0.1.0", source: "stub" },
        assessment: { id: "ws6-stub-assessment", version: "0.1.0", source: "stub" },
      },
    });
  });

  it("reports the stub when WS5_MODULES=stub", async () => {
    setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
    process.env.WS5_MODULES = "stub";
    try {
      const body = await (await GET()).json();
      expect(body.modules.synthesis).toEqual({ id: "ws6-stub-synthesis", version: "0.1.0", source: "stub" });
      expect(body.modules.tutor.source).toBe("stub");
    } finally {
      delete process.env.WS5_MODULES;
    }
  });

  it("reports the real WS5 tutor when WS5_MODULES=real", async () => {
    setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
    process.env.WS5_MODULES = "real";
    try {
      const body = await (await GET()).json();
      expect(body.modules.synthesis).toEqual({ id: "ws5-synthesis", version: "0.2.0", source: "live" });
      expect(body.modules.tutor).toEqual({ id: "ws5-tutor", version: "0.3.0", source: "live" });
    } finally {
      delete process.env.WS5_MODULES;
    }
  });

  it("returns 503 when the knowledge dir cannot be created", async () => {
    const file = path.join(dir, "a-file");
    await fsp.writeFile(file, "x");
    setConfigForTests({
      knowledgeDir: path.join(file, "knowledge"),
      runtimeDir: path.join(dir, "runtime"),
      evaluatorDir: path.join(dir, "runtime", "evaluator"),
    });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.knowledge_dir_writable).toBe(false);
    expect(body.runtime_dir_writable).toBe(true);
  });
});
