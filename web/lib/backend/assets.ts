/**
 * Evidence assets: `knowledge/images/<aid>/{original,highlighted}.<ext>` + `meta.json`.
 * `meta.json` is written last, so its presence means "stored" (research R4). Reads resolve only
 * under the images root and never inside RUNTIME_DIR / EVALUATOR_DIR (research R5).
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  EvidenceAssetSchema,
  parseAssetUploadMeta,
  type AssetFile,
  type EvidenceAsset,
} from "@/lib/contracts";
import { appendBus } from "./bus";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { assertSafeId } from "./ids";
import { sniffImage } from "./image-info";
import { withLock } from "./locks";
import { assetDir, imagesRoot } from "./paths";
import { requireWritableSession, withSessionLock } from "./sessions";
import { canonicalJson, readJson, writeFileAtomic, writeJsonAtomic } from "./store";

type Which = "original" | "highlighted";

/** The stored asset record, or null if `meta.json` is absent (never stored, or crashed mid-upload). */
export function loadAssetMeta(aid: string): Promise<EvidenceAsset | null> {
  return readJson(path.join(assetDir(aid), "meta.json"), EvidenceAssetSchema);
}

export type AssetUploadInput = {
  meta: unknown;
  original: Uint8Array | null;
  highlighted: Uint8Array | null;
};

type PreparedFile = { file: AssetFile; bytes: Uint8Array };

function prepareFile(
  which: Which,
  bytes: Uint8Array,
  declared: { width_px: number; height_px: number },
  maxBytes: number,
): PreparedFile {
  if (bytes.byteLength > maxBytes) {
    throw new ApiError("validation_failed", `${which} exceeds the size limit.`, { field: which, max_bytes: maxBytes });
  }
  const info = sniffImage(bytes);
  if (!info) throw new ApiError("validation_failed", `${which} must be PNG or JPEG.`, { field: which });
  for (const dim of ["width_px", "height_px"] as const) {
    if (declared[dim] !== info[dim]) {
      throw new ApiError("validation_failed", `${which} ${dim} does not match the image.`, {
        field: `${which}.${dim}`,
        declared: declared[dim],
        actual: info[dim],
      });
    }
  }
  return {
    bytes,
    file: {
      path: `${which}.${info.ext}`,
      mime: info.mime,
      width_px: info.width_px,
      height_px: info.height_px,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

export async function putAsset(
  sid: string,
  aid: string,
  input: AssetUploadInput,
): Promise<{ status: 200 | 201; asset: EvidenceAsset }> {
  assertSafeId(sid, "session_id");
  assertSafeId(aid, "asset_id");
  const parsed = parseAssetUploadMeta(input.meta);
  if (!parsed.ok) throw new ApiError("validation_failed", parsed.error.message, { issues: parsed.error.issues });
  const meta = parsed.value;
  if (!input.original) throw new ApiError("validation_failed", "original image is required.", { field: "original" });
  if ((input.highlighted !== null) !== (meta.highlighted !== null)) {
    throw new ApiError("validation_failed", "highlighted image must be sent iff meta.highlighted is set.", {
      field: "highlighted",
    });
  }
  const max = getConfig().assetMaxBytes;
  const original = prepareFile("original", input.original, meta.original, max);
  const highlighted =
    input.highlighted && meta.highlighted ? prepareFile("highlighted", input.highlighted, meta.highlighted, max) : null;

  return withSessionLock(sid, async () => {
    await requireWritableSession(sid, meta.record_state);
    const asset: EvidenceAsset = {
      asset_id: aid,
      session_id: sid,
      event_id: meta.event_id,
      kind: meta.kind,
      original: original.file,
      highlighted: highlighted?.file ?? null,
      coordinate_space: "original_frame_normalized",
      captured_at_utc: meta.captured_at_utc,
      record_state: "on_record",
      source: meta.source,
      status: "stored",
    };
    // The session lock does not cover another session reusing this aid; the asset lock does.
    return withLock(`asset:${aid}`, async () => {
      const stored = await loadAssetMeta(aid);
      if (stored) {
        if (canonicalJson(stored) === canonicalJson(asset)) return { status: 200 as const, asset: stored };
        throw new ApiError("conflict_immutable", "A different asset already exists with this ID.", { asset_id: aid });
      }
      const dir = assetDir(aid);
      for (const f of [original, highlighted]) {
        if (f) await writeFileAtomic(path.join(dir, f.file.path), f.bytes);
      }
      await writeJsonAtomic(path.join(dir, "meta.json"), asset);
      await appendBus(sid, "asset.stored", { asset_id: aid });
      return { status: 201 as const, asset };
    });
  });
}

function notFound(aid: string): ApiError {
  return new ApiError("not_found", "Asset not found.", { asset_id: aid });
}

export async function getAsset(aid: string): Promise<EvidenceAsset> {
  assertSafeId(aid, "asset_id");
  const asset = await loadAssetMeta(aid);
  if (!asset || asset.status === "deleted") throw notFound(aid);
  return asset;
}

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

const isInside = (child: string, root: string) => child === root || child.startsWith(root + path.sep);

export async function readAssetFile(
  aid: string,
  which: Which,
): Promise<{ bytes: Buffer; mime: string; sha256: string }> {
  const asset = await getAsset(aid);
  const file = asset[which];
  if (!file) throw notFound(aid);
  const realFile = await realpathOrNull(path.join(assetDir(aid), file.path));
  const realRoot = await realpathOrNull(imagesRoot());
  if (!realFile || !realRoot || !realFile.startsWith(realRoot + path.sep)) throw notFound(aid);
  const { runtimeDir, evaluatorDir } = getConfig();
  for (const forbidden of [runtimeDir, evaluatorDir]) {
    const realForbidden = await realpathOrNull(forbidden);
    if (realForbidden && isInside(realFile, realForbidden)) throw notFound(aid);
  }
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(realFile);
  } catch {
    throw notFound(aid);
  }
  return { bytes, mime: file.mime, sha256: file.sha256 };
}

/** Shared by the `/api/assets/:aid/{original,highlighted}` routes. */
export async function assetFileResponse(aid: string, which: Which): Promise<Response> {
  const { bytes, mime, sha256 } = await readAssetFile(aid, which);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${sha256}"`,
    },
  });
}
