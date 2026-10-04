// Local-file persistence for expert sessions. Kept behind `ExpertSessionStore`
// so WS6 can swap in the shared backend without touching conversation logic.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { type SessionSnapshot, isValidSessionId } from "./contracts";
import { renderKnowledgeDraftMd, renderRevisionMd } from "./knowledge-render";
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
  "confirmations.json",
  "knowledge-draft.md",
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
      const revisionFiles = await writeRevisions(dir, snapshot);
      for (const name of SESSION_FILES) await writeAtomic(join(dir, name), contents[name]);
      return { dir, files: [...SESSION_FILES, ...revisionFiles] };
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
    "confirmations.json": json(snap.confirmations),
    "knowledge-draft.md": renderKnowledgeDraftMd(snap, { imageHref }),
  };
}

/**
 * revisions/rev-n.json|md. Revisions are immutable: an existing file is only ever rewritten
 * with identical content; different content for an existing revision id is refused.
 */
async function writeRevisions(dir: string, snap: SessionSnapshot): Promise<string[]> {
  if (!snap.revisions.length) return [];
  const revDir = join(dir, "revisions");
  await mkdir(revDir, { recursive: true });
  const files: string[] = [];
  // a strike redacts the revisions that relied on the struck words; only those may be rewritten
  const redacted = new Set(snap.strikes.flatMap(st => st.superseded_revision_ids));
  for (const rev of snap.revisions) {
    const pairs: [string, string][] = [
      [`${rev.revision_id}.json`, JSON.stringify(rev, null, 2) + "\n"],
      [`${rev.revision_id}.md`, renderRevisionMd(rev)],
    ];
    for (const [name, data] of pairs) {
      const path = join(revDir, name);
      const existing = await readFile(path, "utf8").catch(() => null);
      if (existing !== null && existing !== data && !redacted.has(rev.revision_id)) {
        throw new Error(`revision ${rev.revision_id} already exists with different content; revisions are immutable`);
      }
      if (existing !== data) await writeAtomic(path, data);
      files.push(`revisions/${name}`);
    }
  }
  return files;
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
