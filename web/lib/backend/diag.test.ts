import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfig, setConfigForTests } from "./config";
import { diag, sanitizeDiag } from "./diag";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-diag-"));
  setConfigForTests({ runtimeDir: dir });
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

const now = new Date("2026-10-04T10:11:12.000Z");

describe("sanitizeDiag", () => {
  it("keeps exactly the allow-listed keys", () => {
    const line = sanitizeDiag(
      {
        component: "events",
        op: "put",
        ids: { session_id: "ses-1", event_id: "evt-001" },
        outcome: "error",
        duration_ms: 12.5,
        error_code: "asset_not_available",
      },
      now,
    );
    expect(line).toEqual({
      at_utc: "2026-10-04T10:11:12.000Z",
      component: "events",
      op: "put",
      ids: { session_id: "ses-1", event_id: "evt-001" },
      outcome: "error",
      duration_ms: 12.5,
      error_code: "asset_not_available",
    });
  });

  it("strips content fields at the top level", () => {
    const input = {
      component: "exchanges",
      op: "put",
      ids: {},
      outcome: "ok",
      duration_ms: 1,
      question: "What do you see?",
      answer_lines: [{ text: "secret expert words" }],
      body: "x",
      message: "y",
    } as unknown as Parameters<typeof sanitizeDiag>[0];
    const line = sanitizeDiag(input, now);
    expect(Object.keys(line).sort()).toEqual(["at_utc", "component", "duration_ms", "ids", "op", "outcome"]);
    expect(JSON.stringify(line)).not.toContain("secret");
  });

  it("drops ids that are not IDs (content smuggled into ids)", () => {
    const line = sanitizeDiag(
      {
        component: "events",
        op: "put",
        ids: { event_id: "evt-001", note: "The expert said the spike is fine", "Bad Key": "x", n: 5 as unknown as string },
        outcome: "ok",
        duration_ms: 1,
      },
      now,
    );
    expect(line.ids).toEqual({ event_id: "evt-001" });
  });

  it("drops invalid component/op/outcome/duration/error_code values", () => {
    const line = sanitizeDiag(
      {
        component: "Expert says hi",
        op: "put everything",
        ids: {},
        outcome: "maybe" as "ok",
        duration_ms: -1,
        error_code: "made_up" as "internal",
      },
      now,
    );
    expect(line).toEqual({ at_utc: "2026-10-04T10:11:12.000Z", ids: {} });
  });
});

describe("diag", () => {
  it("appends one sanitized line to RUNTIME_DIR/diag/<yyyy-mm-dd>.ndjson", async () => {
    await diag({ component: "sessions", op: "create", ids: { session_id: "ses-1" }, outcome: "ok", duration_ms: 3 }, now);
    await diag(
      { component: "sessions", op: "get", ids: {}, outcome: "ok", duration_ms: 1, text: "nope" } as unknown as Parameters<
        typeof diag
      >[0],
      now,
    );
    const text = await fsp.readFile(path.join(dir, "diag", "2026-10-04.ndjson"), "utf8");
    const lines = text.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ component: "sessions", op: "create", ids: { session_id: "ses-1" } });
    expect(text).not.toContain("nope");
  });

  it("never throws when the log cannot be written", async () => {
    const file = path.join(dir, "a-file");
    await fsp.writeFile(file, "x");
    setConfigForTests({ runtimeDir: file });
    await expect(
      diag({ component: "sessions", op: "get", ids: {}, outcome: "ok", duration_ms: 1 }, now),
    ).resolves.toBeDefined();
  });
});
