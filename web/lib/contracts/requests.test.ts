import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAssetUploadMeta,
  parseCreateSessionRequest,
  parseEventAck,
  parseExchangePut,
  parseLifecycleRequest,
  parseRecordStateRequest,
} from "./index";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "ws6", name), "utf8"));

describe("CreateSessionRequest", () => {
  it("accepts an expert request with defaults", () => {
    const r = parseCreateSessionRequest({ role: "expert" });
    expect(r).toEqual({ ok: true, value: { role: "expert", source: "live", trace_ref: null } });
  });
  it("accepts source and trace_ref", () => {
    const r = parseCreateSessionRequest({ role: "expert", source: "fixture", trace_ref: "trace A" });
    expect(r.ok && r.value).toEqual({ role: "expert", source: "fixture", trace_ref: "trace A" });
  });
  it("accepts a newcomer with an optional case_id", () => {
    expect(parseCreateSessionRequest({ role: "newcomer" })).toEqual({
      ok: true,
      value: { role: "newcomer", source: "live", case_id: null },
    });
    expect(parseCreateSessionRequest({ role: "newcomer", case_id: "fx-n01" }).ok).toBe(true);
  });
  it.each([
    {},
    { role: "expert", source: "x" },
    { role: "expert", extra: 1 },
    { role: "newcomer", trace_ref: "t" },
    { role: "newcomer", case_id: "N01" },
  ])(
    "rejects %j",
    (body) => expect(parseCreateSessionRequest(body).ok).toBe(false),
  );
});

describe("LifecycleRequest / RecordStateRequest", () => {
  it("accepts valid bodies", () => {
    expect(parseLifecycleRequest({ action: "start", rev: 1 }).ok).toBe(true);
    expect(parseRecordStateRequest({ state: "off_record" }).ok).toBe(true);
  });
  it.each([{ action: "pause", rev: 1 }, { action: "start" }, { action: "end", rev: 0 }, { action: "end", rev: 1.5 }])(
    "rejects lifecycle %j",
    (body) => expect(parseLifecycleRequest(body).ok).toBe(false),
  );
  it("rejects an unknown record state", () => {
    expect(parseRecordStateRequest({ state: "paused" }).ok).toBe(false);
  });
});

describe("AssetUploadMeta", () => {
  const base = {
    kind: "frame",
    captured_at_utc: "2026-10-03T10:00:05.000Z",
    source: "fixture",
    original: { width_px: 320, height_px: 180 },
  };
  it("accepts a minimal meta and fills defaults", () => {
    const r = parseAssetUploadMeta(base);
    expect(r.ok && r.value).toEqual({
      ...base,
      event_id: null,
      record_state: "on_record",
      coordinate_space: "original_frame_normalized",
      highlighted: null,
    });
  });
  it("accepts highlighted dims and event_id", () => {
    const r = parseAssetUploadMeta({ ...base, event_id: "evt-001", highlighted: { width_px: 320, height_px: 180 } });
    expect(r.ok).toBe(true);
  });
  it.each([
    { ...base, original: { width_px: 0, height_px: 1 } },
    { ...base, kind: "drawing" },
    { ...base, sha256: "a".repeat(64) },
    { ...base, event_id: "../x" },
  ])("rejects %j", (body) => expect(parseAssetUploadMeta(body).ok).toBe(false));
});

describe("EventAck / ExchangePut", () => {
  it("accepts an ack", () => {
    expect(parseEventAck({ event_id: "evt-001", status: "stored", seq: 3 }).ok).toBe(true);
    expect(parseEventAck({ event_id: "evt-001", status: "queued", seq: 3 }).ok).toBe(false);
  });
  it("requires rev on an exchange put", () => {
    const ex = fixture("expert-exchange.json") as Record<string, unknown>;
    expect(parseExchangePut(ex).ok).toBe(true);
    const { rev: _rev, ...noRev } = ex;
    expect(parseExchangePut(noRev).ok).toBe(false);
  });
});
