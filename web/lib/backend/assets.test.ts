import { createHash } from "node:crypto";
import { readFileSync, promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EvidenceAsset } from "@/lib/contracts";
import { getAsset, loadAssetMeta, putAsset, readAssetFile } from "./assets";
import { readBusAfter } from "./bus";
import { resetConfig, setConfigForTests } from "./config";
import { ApiError } from "./errors";
import { assetDir } from "./paths";
import { changeLifecycle, changeRecordState, createSession } from "./sessions";

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.join(process.cwd(), "fixtures", "ws6", name)));
const ORIGINAL = fixture("fixture-frame.png");
const HIGHLIGHTED = fixture("fixture-frame-highlighted.png");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const AID = "asset-001";
const META = {
  kind: "frame",
  captured_at_utc: "2026-10-03T10:00:05.000Z",
  source: "fixture",
  event_id: "event-001",
  original: { width_px: 320, height_px: 180 },
  highlighted: { width_px: 320, height_px: 180 },
};
const NO_HIGHLIGHT = { ...META, highlighted: null };

let dir: string;
let sid: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-assets-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
  sid = (await createSession({ role: "expert", source: "fixture", trace_ref: null })).session.session_id;
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

async function errorOf(p: Promise<unknown>): Promise<ApiError | null> {
  return p.then(
    () => null,
    (e: unknown) => {
      if (e instanceof ApiError) return e;
      throw e;
    },
  );
}

const putFull = (s = sid, aid = AID) => putAsset(s, aid, { meta: META, original: ORIGINAL, highlighted: HIGHLIGHTED });
const exists = (p: string) => fsp.stat(p).then(() => true, () => false);
const assetBusLines = async (s = sid) => (await readBusAfter(s, 0)).filter((e) => e.type === "asset.stored");

describe("putAsset", () => {
  it("stores both files, meta.json and one asset.stored bus line (201)", async () => {
    const { status, asset } = await putFull();
    expect(status).toBe(201);
    expect(asset).toEqual({
      asset_id: AID,
      session_id: sid,
      event_id: "event-001",
      kind: "frame",
      original: { path: "original.png", mime: "image/png", width_px: 320, height_px: 180, sha256: sha(ORIGINAL) },
      highlighted: { path: "highlighted.png", mime: "image/png", width_px: 320, height_px: 180, sha256: sha(HIGHLIGHTED) },
      coordinate_space: "original_frame_normalized",
      captured_at_utc: "2026-10-03T10:00:05.000Z",
      record_state: "on_record",
      source: "fixture",
      status: "stored",
    });
    expect(asset.original.sha256).toBe("eb900185cbb5efd0a18f695f7c0f518db99e3394e4742c11cf2cbf0472866728");
    const d = assetDir(AID);
    expect(new Uint8Array(await fsp.readFile(path.join(d, "original.png")))).toEqual(ORIGINAL);
    expect(new Uint8Array(await fsp.readFile(path.join(d, "highlighted.png")))).toEqual(HIGHLIGHTED);
    expect(await loadAssetMeta(AID)).toEqual(asset);
    const lines = await assetBusLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].ids).toEqual({ asset_id: AID });
  });

  it("stores an asset without a highlighted image", async () => {
    const { status, asset } = await putAsset(sid, AID, { meta: NO_HIGHLIGHT, original: ORIGINAL, highlighted: null });
    expect(status).toBe(201);
    expect(asset.highlighted).toBeNull();
    expect(await exists(path.join(assetDir(AID), "highlighted.png"))).toBe(false);
  });

  it("an identical retry returns 200 without rewriting or a new bus line", async () => {
    await putFull();
    const metaFile = path.join(assetDir(AID), "meta.json");
    const before = (await fsp.stat(metaFile)).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    const again = await putFull();
    expect(again.status).toBe(200);
    expect((await fsp.stat(metaFile)).mtimeMs).toBe(before);
    expect(await assetBusLines()).toHaveLength(1);
  });

  it("different bytes for the same aid → 409 and stored files unchanged", async () => {
    await putFull();
    const err = await errorOf(putAsset(sid, AID, { meta: META, original: HIGHLIGHTED, highlighted: ORIGINAL }));
    expect(err?.code).toBe("conflict_immutable");
    expect(new Uint8Array(await fsp.readFile(path.join(assetDir(AID), "original.png")))).toEqual(ORIGINAL);
    expect(await assetBusLines()).toHaveLength(1);
  });

  it("the same aid from a different session → 409", async () => {
    await putFull();
    const other = (await createSession({ role: "expert", source: "fixture", trace_ref: null })).session.session_id;
    expect((await errorOf(putFull(other)))?.code).toBe("conflict_immutable");
  });

  it("off-record session → 403 and nothing written", async () => {
    await changeRecordState(sid, { state: "off_record" });
    expect((await errorOf(putFull()))?.code).toBe("off_record");
    expect(await exists(assetDir(AID))).toBe(false);
  });

  it("off-record label in meta → 403 and nothing written", async () => {
    const err = await errorOf(
      putAsset(sid, AID, { meta: { ...META, record_state: "off_record" }, original: ORIGINAL, highlighted: HIGHLIGHTED }),
    );
    expect(err?.code).toBe("off_record");
    expect(await exists(assetDir(AID))).toBe(false);
  });

  it("aborted session → 409 invalid_transition", async () => {
    await changeLifecycle(sid, { action: "abort", rev: 1 });
    expect((await errorOf(putFull()))?.code).toBe("invalid_transition");
  });

  it("unknown session → 404", async () => {
    expect((await errorOf(putFull("ses-missing")))?.code).toBe("not_found");
  });

  it("declared dimensions must match the image", async () => {
    const err = await errorOf(
      putAsset(sid, AID, {
        meta: { ...META, original: { width_px: 321, height_px: 180 } },
        original: ORIGINAL,
        highlighted: HIGHLIGHTED,
      }),
    );
    expect(err?.code).toBe("validation_failed");
    expect(err?.details).toEqual({ field: "original.width_px", declared: 321, actual: 320 });
  });

  it("rejects files over the size cap", async () => {
    setConfigForTests({ assetMaxBytes: 100 });
    const err = await errorOf(putFull());
    expect(err?.code).toBe("validation_failed");
    expect(err?.details).toEqual({ field: "original", max_bytes: 100 });
  });

  it("rejects non-images", async () => {
    const err = await errorOf(
      putAsset(sid, AID, { meta: NO_HIGHLIGHT, original: new TextEncoder().encode("GIF89a......"), highlighted: null }),
    );
    expect(err?.code).toBe("validation_failed");
    expect(err?.message).toMatch(/PNG or JPEG/);
  });

  it("requires the original", async () => {
    expect((await errorOf(putAsset(sid, AID, { meta: NO_HIGHLIGHT, original: null, highlighted: null })))?.code).toBe(
      "validation_failed",
    );
  });

  it("highlighted must be present iff meta.highlighted is set", async () => {
    expect((await errorOf(putAsset(sid, AID, { meta: META, original: ORIGINAL, highlighted: null })))?.code).toBe(
      "validation_failed",
    );
    expect(
      (await errorOf(putAsset(sid, AID, { meta: NO_HIGHLIGHT, original: ORIGINAL, highlighted: HIGHLIGHTED })))?.code,
    ).toBe("validation_failed");
  });

  it("rejects invalid meta with issues", async () => {
    const err = await errorOf(putAsset(sid, AID, { meta: { kind: "selfie" }, original: ORIGINAL, highlighted: null }));
    expect(err?.code).toBe("validation_failed");
    expect(Array.isArray(err?.details?.issues)).toBe(true);
  });

  it("recovers from a crash that left image files without meta.json", async () => {
    await fsp.mkdir(assetDir(AID), { recursive: true });
    await fsp.writeFile(path.join(assetDir(AID), "original.png"), HIGHLIGHTED);
    expect(await loadAssetMeta(AID)).toBeNull();
    expect((await errorOf(getAsset(AID)))?.code).toBe("not_found");
    expect((await putFull()).status).toBe(201);
    expect(new Uint8Array(await fsp.readFile(path.join(assetDir(AID), "original.png")))).toEqual(ORIGINAL);
  });

  it("rejects unsafe IDs", async () => {
    expect((await errorOf(putFull(sid, "a/b")))?.code).toBe("validation_failed");
    expect((await errorOf(putFull("../x", AID)))?.code).toBe("validation_failed");
  });
});

describe("getAsset / readAssetFile", () => {
  it("returns the stored record and file bytes", async () => {
    const { asset } = await putFull();
    expect(await getAsset(AID)).toEqual(asset);
    const file = await readAssetFile(AID, "original");
    expect(new Uint8Array(file.bytes)).toEqual(ORIGINAL);
    expect(file.mime).toBe("image/png");
    expect(file.sha256).toBe(sha(ORIGINAL));
    expect(new Uint8Array((await readAssetFile(AID, "highlighted")).bytes)).toEqual(HIGHLIGHTED);
  });

  it("404 for unknown assets and missing highlighted", async () => {
    expect((await errorOf(getAsset("nope")))?.code).toBe("not_found");
    expect((await errorOf(readAssetFile("nope", "original")))?.code).toBe("not_found");
    await putAsset(sid, AID, { meta: NO_HIGHLIGHT, original: ORIGINAL, highlighted: null });
    expect((await errorOf(readAssetFile(AID, "highlighted")))?.code).toBe("not_found");
  });

  it("404 when the image file is missing", async () => {
    await putFull();
    await fsp.rm(path.join(assetDir(AID), "original.png"));
    expect((await errorOf(readAssetFile(AID, "original")))?.code).toBe("not_found");
  });

  it("rejects path traversal IDs", async () => {
    expect((await errorOf(getAsset("../etc")))?.code).toBe("validation_failed");
    expect((await errorOf(readAssetFile("..", "original")))?.code).toBe("validation_failed");
  });

  it("does not serve files reached through a symlink into the runtime dir", async () => {
    const runtimeDir = path.join(dir, "runtime");
    await fsp.mkdir(runtimeDir, { recursive: true });
    await fsp.writeFile(path.join(runtimeDir, "secret.png"), ORIGINAL);
    const meta: EvidenceAsset = {
      asset_id: "evil",
      session_id: sid,
      event_id: null,
      kind: "frame",
      original: { path: "secret.png", mime: "image/png", width_px: 320, height_px: 180, sha256: sha(ORIGINAL) },
      highlighted: null,
      coordinate_space: "original_frame_normalized",
      captured_at_utc: "2026-10-03T10:00:05.000Z",
      record_state: "on_record",
      source: "fixture",
      status: "stored",
    };
    await fsp.writeFile(path.join(runtimeDir, "meta.json"), JSON.stringify(meta));
    await fsp.mkdir(path.join(dir, "knowledge", "images"), { recursive: true });
    await fsp.symlink(runtimeDir, path.join(dir, "knowledge", "images", "evil"));
    expect((await errorOf(readAssetFile("evil", "original")))?.code).toBe("not_found");
  });

  it("does not serve a file whose stored path was tampered", async () => {
    await putFull();
    await fsp.writeFile(path.join(dir, "secret"), "top secret");
    const metaFile = path.join(assetDir(AID), "meta.json");
    const stored = JSON.parse(await fsp.readFile(metaFile, "utf8")) as EvidenceAsset;
    await fsp.writeFile(metaFile, JSON.stringify({ ...stored, original: { ...stored.original, path: "../../secret" } }));
    expect((await errorOf(readAssetFile(AID, "original")))?.code).toBe("not_found");
  });

  it("an identical retry is answered 200 even after the session went off-record", async () => {
    const first = await putFull();
    await changeRecordState(sid, { state: "off_record" });
    const retry = await putFull();
    expect(retry).toEqual({ status: 200, asset: first.asset });
  });

  it("deleted assets are 404", async () => {
    const { asset } = await putFull();
    await fsp.writeFile(path.join(assetDir(AID), "meta.json"), JSON.stringify({ ...asset, status: "deleted" }));
    expect((await errorOf(getAsset(AID)))?.code).toBe("not_found");
    expect((await errorOf(readAssetFile(AID, "original")))?.code).toBe("not_found");
  });
});
