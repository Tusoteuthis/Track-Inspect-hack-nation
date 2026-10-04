// Local-file persistence for expert sessions. Kept behind `ExpertSessionStore`
// so WS6 can swap in the shared backend without touching conversation logic.

import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { type SessionSnapshot, isValidSessionId } from "./contracts";
import { renderExchangesMd, renderTranscriptMd } from "./render";
import { liveCounters, renderTimingReportMd } from "./timing";

export const SESSION_FILES = [
  "session.json",
  "events.json",
  "exchanges.json",
  "timing.json",
  "transcript.md",
  "exchanges.md",
  "timing-report.md",
] as const;

export interface ExpertSessionStore {
  /** Writes the whole session; saving the same snapshot again yields the same files. */
  saveSnapshot(snapshot: SessionSnapshot): Promise<{ dir: string; files: string[] }>;
}

/** `KNOWLEDGE_DIR` (absolute, or relative to the web dir), default `<web>/../knowledge`. */
export function knowledgeRoot(env: Record<string, string | undefined> = process.env, webDir = process.cwd()): string {
  return resolve(webDir, env.KNOWLEDGE_DIR?.trim() || join("..", "knowledge"));
}

export function createFileStore(root: string, options: { publicDir?: string } = {}): ExpertSessionStore {
  const sessionsDir = resolve(root, "sessions");
  return {
    async saveSnapshot(snapshot) {
      // Second line of defence after route validation: the id becomes a directory name.
      const id = snapshot.session_id;
      const dir = resolve(sessionsDir, id);
      if (!isValidSessionId(id) || dirname(dir) !== sessionsDir) throw new Error(`unsafe session id ${JSON.stringify(id)}`);

      const imageHref = options.publicDir
        ? (ref: string) => relative(dir, join(options.publicDir!, ref)).split(sep).join("/")
        : undefined;
      const contents = sessionFiles(snapshot, imageHref);
      await mkdir(dir, { recursive: true });
      for (const name of SESSION_FILES) await writeAtomic(join(dir, name), contents[name]);
      return { dir, files: [...SESSION_FILES] };
    },
  };
}

function sessionFiles(
  snap: SessionSnapshot,
  imageHref: ((ref: string) => string) | undefined
): Record<(typeof SESSION_FILES)[number], string> {
  const { events, exchanges, timing, ...session } = snap;
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  const counts = {
    events: events.length,
    exchanges: exchanges.length,
    preamble_lines: snap.preamble.length,
    topics: snap.topics.length,
    ...liveCounters(snap),
  };
  return {
    "session.json": json({ ...session, counts }),
    "events.json": json(events),
    "exchanges.json": json(exchanges),
    "timing.json": json(timing),
    "transcript.md": renderTranscriptMd(snap),
    "exchanges.md": renderExchangesMd(snap, { imageHref }),
    "timing-report.md": renderTimingReportMd(snap),
  };
}

/** Write to a temp file in the same directory, then rename: readers never see a half-written file. */
async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmp, data, "utf8");
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
