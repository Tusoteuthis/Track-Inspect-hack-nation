import path from "node:path";
import { getConfig } from "./config";
import { safeJoin } from "./ids";

/** `knowledge/sessions/<sid>` (sid validated). */
export function sessionDir(sid: string): string {
  return safeJoin(path.join(getConfig().knowledgeDir, "sessions"), sid);
}

export function sessionFile(sid: string): string {
  return path.join(sessionDir(sid), "session.json");
}

/** `knowledge/sessions/<sid>/<kind>/<id>.json` (both IDs validated). */
export function sessionRecordFile(sid: string, kind: "events" | "exchanges", id: string): string {
  return safeJoin(path.join(sessionDir(sid), kind), id) + ".json";
}

/** The only directory asset bytes are ever served from. */
export function imagesRoot(): string {
  return path.join(getConfig().knowledgeDir, "images");
}

/** `knowledge/images/<aid>` (aid validated). */
export function assetDir(aid: string): string {
  return safeJoin(imagesRoot(), aid);
}
