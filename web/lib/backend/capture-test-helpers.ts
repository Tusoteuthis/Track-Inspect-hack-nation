// Test-only helpers shared by the capture-path tests (events, exchanges, routes).
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EvidenceAsset, ExchangePut, PointingEventIngest } from "@/lib/contracts";
import { resetConfig, setConfigForTests } from "./config";
import { ApiError } from "./errors";
import { assetDir } from "./paths";
import { createSession } from "./sessions";
import { writeJsonAtomic } from "./store";

export async function useTempDirs(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
  return {
    dir,
    cleanup: async () => {
      resetConfig();
      await fsp.rm(dir, { recursive: true, force: true });
    },
  };
}

export async function newExpertSession(): Promise<string> {
  return (await createSession({ role: "expert", source: "fixture", trace_ref: null })).session.session_id;
}

const file = (name: string, sha: string) => ({
  path: name,
  mime: "image/png" as const,
  width_px: 320,
  height_px: 180,
  sha256: sha.repeat(64).slice(0, 64),
});

/** Writes an asset record directly (the upload path is tested in assets.test.ts). */
export async function seedAsset(
  sid: string,
  aid: string,
  overrides: Partial<EvidenceAsset> = {},
): Promise<EvidenceAsset> {
  const asset: EvidenceAsset = {
    asset_id: aid,
    session_id: sid,
    event_id: null,
    kind: "frame",
    original: file("original.png", "a"),
    highlighted: file("highlighted.png", "b"),
    coordinate_space: "original_frame_normalized",
    captured_at_utc: "2026-10-03T10:00:05.000Z",
    record_state: "on_record",
    source: "fixture",
    status: "stored",
    ...overrides,
  };
  await writeJsonAtomic(path.join(assetDir(aid), "meta.json"), asset);
  return asset;
}

export function makeEvent(sid: string, eid: string, aid: string, overrides: Partial<PointingEventIngest> = {}): PointingEventIngest {
  return {
    schema_version: "ws3.v0",
    session_id: sid,
    event_id: eid,
    source: "fixture",
    captured_at_utc: "2026-10-03T10:00:05.000Z",
    session_time_ms: 5000,
    frame_id: `frame-${eid}`,
    image_ref: "placeholder-original",
    highlighted_image_ref: "placeholder-highlighted",
    region: {
      x: 0.25,
      y: 0.3,
      width: 0.25,
      height: 0.4,
      coordinate_space: "original_frame_normalized",
      frame_width_px: 320,
      frame_height_px: 180,
    },
    mapping_status: "resolved",
    trace_id: "fixture-trace-001",
    channel_id: "FIXTURE-CH1",
    signal_interval: null,
    record_state: "on_record",
    asset_id: aid,
    ...overrides,
  };
}

export function makeExchange(sid: string, xid: string, eventId: string | null, rev: number, lines = 1): ExchangePut {
  return {
    exchange_id: xid,
    session_id: sid,
    event_id: eventId,
    phase: "live",
    kind: "explain",
    question: "FIXTURE question",
    question_planned: null,
    answer_lines: Array.from({ length: lines }, (_, i) => ({
      text: `FIXTURE answer line ${i + 1}`,
      at_utc: `2026-10-03T10:00:1${i}.000Z`,
      transcript_line_id: `line-${i + 1}`,
    })),
    asked_at_utc: "2026-10-03T10:00:08.000Z",
    answer_started_at_utc: "2026-10-03T10:00:10.000Z",
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    record_state: "on_record",
    source: "fixture",
    rev,
  };
}

export async function codeOf(p: Promise<unknown>): Promise<string | null> {
  return p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : "other"),
  );
}

export async function errorOf(p: Promise<unknown>): Promise<ApiError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof ApiError)) throw new Error(`expected ApiError, got ${String(err)}`);
  return err;
}
