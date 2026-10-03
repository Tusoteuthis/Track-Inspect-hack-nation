import path from "node:path";
import { EvidenceAssetSchema, type EvidenceAsset } from "@/lib/contracts";
import { assetDir } from "./paths";
import { readJson } from "./store";

/** The stored asset record, or null if `meta.json` is absent (never stored, or crashed mid-upload). */
export function loadAssetMeta(aid: string): Promise<EvidenceAsset | null> {
  return readJson(path.join(assetDir(aid), "meta.json"), EvidenceAssetSchema);
}
