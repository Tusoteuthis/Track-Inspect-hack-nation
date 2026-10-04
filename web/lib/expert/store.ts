// Local-file persistence for expert sessions. Kept behind `ExpertSessionStore`
// so WS6 can swap in the shared backend without touching conversation logic.

import { dirname, join, relative, resolve, sep } from "node:path";
import { getBlobStore } from "@/lib/backend/blobstore";
import { type ElevenLabsDeletionReport, type SessionSnapshot, isValidSessionId, validateSessionSnapshot } from "./contracts";
import { deriveCompletion, renderCompletionMd } from "./completion";
import { type ChecklistRow, demoChecklist, renderDemoEvidenceMd } from "./demo-evidence";
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

/** Written once the session has ended (removed again if it is resumed). */
export const END_FILES = ["completion.json", "completion.md", "demo-evidence.md"] as const;
export const DELETION_FILE = "elevenlabs-deletion.json";

export interface ExpertSessionStore {
  /** Writes the whole session; saving the same snapshot again yields the same files. */
  saveSnapshot(snapshot: SessionSnapshot): Promise<{ dir: string; files: string[] }>;
  /** Reads a saved session back from its files; null when there is none. Throws if the files are invalid. */
  loadSnapshot(sessionId: string): Promise<SessionSnapshot | null>;
  /** Re-derives demo-evidence.md from the saved files and writes it. */
  exportDemoEvidence(sessionId: string): Promise<{ markdown: string; checklist: ChecklistRow[] } | null>;
  /** Appends an ElevenLabs deletion report to elevenlabs-deletion.json. */
  saveDeletionReport(report: ElevenLabsDeletionReport): Promise<void>;
}

/** `KNOWLEDGE_DIR` (absolute, or relative to the web dir), default `<web>/../knowledge`. */
export function knowledgeRoot(env: Record<string, string | undefined> = process.env, webDir = process.cwd()): string {
  return resolve(webDir, env.KNOWLEDGE_DIR?.trim() || join("..", "knowledge"));
}

export function createFileStore(root: string, options: { publicDir?: string } = {}): ExpertSessionStore {
  const sessionsDir = resolve(root, "sessions");
  // Second line of defence after route validation: the id becomes a directory name.
  const sessionDir = (id: string) => {
    const dir = resolve(sessionsDir, id);
    if (!isValidSessionId(id) || dirname(dir) !== sessionsDir) throw new Error(`unsafe session id ${JSON.stringify(id)}`);
    return dir;
  };
  const hrefFor = (dir: string) =>
    options.publicDir ? (ref: string) => relative(dir, join(options.publicDir!, ref)).split(sep).join("/") : undefined;

  const store: ExpertSessionStore = {
    async saveSnapshot(snapshot) {
      const dir = sessionDir(snapshot.session_id);
      const imageHref = hrefFor(dir);
      const contents = sessionFiles(snapshot, imageHref);
      const revisionFiles = await writeRevisions(dir, snapshot);
      for (const name of SESSION_FILES) await writeAtomic(join(dir, name), contents[name]);
      if (snapshot.ended_at_utc === null) {
        for (const name of END_FILES) await getBlobStore().delete(join(dir, name));
        return { dir, files: [...SESSION_FILES, ...revisionFiles] };
      }
      const completion = deriveCompletion(snapshot);
      await writeAtomic(join(dir, "completion.json"), JSON.stringify(completion, null, 2) + "\n");
      await writeAtomic(join(dir, "completion.md"), renderCompletionMd(completion));
      await writeAtomic(join(dir, "demo-evidence.md"), renderDemoEvidenceMd(snapshot, { imageHref }));
      return { dir, files: [...SESSION_FILES, ...revisionFiles, ...END_FILES] };
    },

    async loadSnapshot(sessionId) {
      const dir = sessionDir(sessionId);
      const read = async (name: string): Promise<unknown> => {
        const text = await getBlobStore().getText(join(dir, name));
        if (text === null) throw new Error(`saved session ${sessionId} is missing ${name}`);
        return JSON.parse(text);
      };
      let session: Record<string, unknown>;
      try {
        session = (await read("session.json")) as Record<string, unknown>;
      } catch {
        return null;
      }
      const { counts: _counts, ...rest } = session;
      const snapshot = { ...rest, events: await read("events.json"), exchanges: await read("exchanges.json"), timing: await read("timing.json") };
      const valid = validateSessionSnapshot(snapshot);
      if (!valid.ok) throw new Error(`saved session ${sessionId} is invalid: ${valid.errors.slice(0, 5).join("; ")}`);
      return valid.value;
    },

    async exportDemoEvidence(sessionId) {
      const snapshot = await store.loadSnapshot(sessionId);
      if (!snapshot) return null;
      const dir = sessionDir(sessionId);
      const imageHref = hrefFor(dir);
      const markdown = renderDemoEvidenceMd(snapshot, { imageHref });
      await writeAtomic(join(dir, "demo-evidence.md"), markdown);
      return { markdown, checklist: demoChecklist(snapshot, { imageHref }) };
    },

    async saveDeletionReport(report) {
      const path = join(sessionDir(report.session_id), DELETION_FILE);
      const existing = await getBlobStore()
        .getText(path)
        .then(t => (t === null ? [] : (JSON.parse(t) as ElevenLabsDeletionReport[])))
        .catch(() => []);
      await writeAtomic(path, JSON.stringify([...existing, report], null, 2) + "\n");
    },
  };
  return store;
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
      const existing = await getBlobStore().getText(path).catch(() => null);
      if (existing !== null && existing !== data && !redacted.has(rev.revision_id)) {
        throw new Error(`revision ${rev.revision_id} already exists with different content; revisions are immutable`);
      }
      if (existing !== data) await writeAtomic(path, data);
      files.push(`revisions/${name}`);
    }
  }
  return files;
}

/** Atomic replace through the backend BlobStore (fs: temp file + rename): readers never see a half-written file. */
function writeAtomic(path: string, data: string): Promise<void> {
  return getBlobStore().put(path, data);
}
