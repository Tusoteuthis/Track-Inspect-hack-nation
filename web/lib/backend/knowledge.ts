/**
 * Knowledge revision store.
 *
 * - `entries/<entry_id>/rev-<n>.md` is immutable: WS6 frontmatter (`KnowledgeRevision`, one
 *   `key: <JSON>` per line) + the module's Markdown. A module frontmatter block is kept verbatim in
 *   one HTML comment so the file has a single frontmatter and the module Markdown round-trips.
 * - Status changes never touch revision files; they go to `entries/<entry_id>/status.ndjson`.
 * - `current.json` is written only after the revision file, under the knowledge lock.
 * - Every write here must run inside `withKnowledgeLock`. Lock order: session lock, then knowledge.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  KnowledgeEntrySchema,
  KnowledgeRevisionSchema,
  ModuleInfoSchema,
  SCHEMA_VERSION,
  StatusTransitionSchema,
  UtcSchema,
  type EntryStatus,
  type KnowledgeEntry,
  type KnowledgeRevision,
  type ModuleInfo,
  type ProducedBy,
  type StatusTransition,
} from "@/lib/contracts";
import { getConfig } from "./config";
import { ApiError } from "./errors";
import { assertSafeId, isValidId, newId, safeJoin } from "./ids";
import { withLock } from "./locks";
import { readJson, writeFileAtomic, writeJsonAtomic } from "./store";

export function withKnowledgeLock<T>(fn: () => Promise<T>): Promise<T> {
  return withLock("knowledge", fn);
}

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const entriesRoot = () => path.join(getConfig().knowledgeDir, "entries");
export const entryDir = (entryId: string) => safeJoin(entriesRoot(), entryId);
export const revisionFile = (entryId: string, no: number) => path.join(entryDir(entryId), `rev-${no}.md`);
const currentFile = (entryId: string) => path.join(entryDir(entryId), "current.json");
const statusLogFile = (entryId: string) => path.join(entryDir(entryId), "status.ndjson");
export const workflowFile = () => path.join(getConfig().knowledgeDir, "workflow.md");

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code;
}

async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return null;
    throw err;
  }
}

// --- file format ----------------------------------------------------------------

const MODULE_FRONTMATTER = "<!-- ws6:module-frontmatter ";
const FRONTMATTER_KEYS = Object.keys(KnowledgeRevisionSchema.shape) as (keyof KnowledgeRevision)[];

/** JSON that is safe on one line inside an HTML comment. */
const commentJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

function renderFrontmatter(record: Record<string, unknown>, keys: readonly string[]): string {
  const lines = keys.filter(k => record[k] !== undefined).map(k => `${k}: ${JSON.stringify(record[k])}`);
  return ["---", ...lines, "---"].join("\n");
}

function splitFrontmatter(text: string): { meta: Record<string, unknown>; rest: string } {
  if (!text.startsWith("---\n")) throw new Error("missing frontmatter");
  const end = text.indexOf("\n---\n", 3);
  if (end < 0) throw new Error("unterminated frontmatter");
  const meta: Record<string, unknown> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const i = line.indexOf(": ");
    if (i <= 0) throw new Error("malformed frontmatter line");
    meta[line.slice(0, i)] = JSON.parse(line.slice(i + 2)) as unknown;
  }
  return { meta, rest: text.slice(end + 5) };
}

/** Splits a leading `---` block off the module Markdown only if it reassembles byte-for-byte. */
function splitModuleFrontmatter(md: string): { front: string | null; body: string } {
  if (md.startsWith("---\n")) {
    const end = md.indexOf("\n---\n", 3);
    if (end >= 0) {
      const front = md.slice(4, end);
      const body = md.slice(end + 5);
      if (`---\n${front}\n---\n${body}` === md) return { front, body };
    }
  }
  return { front: null, body: md };
}

export function renderRevisionFile(revision: KnowledgeRevision, moduleMarkdown: string): string {
  const { front, body } = splitModuleFrontmatter(moduleMarkdown);
  return `${renderFrontmatter(revision, FRONTMATTER_KEYS)}\n${MODULE_FRONTMATTER}${commentJson(front)} -->\n${body}`;
}

/** Throws on a structurally invalid file (callers map that to a broken link or an internal error). */
export function parseRevisionFile(text: string): { revision: KnowledgeRevision; markdown: string } {
  const { meta, rest } = splitFrontmatter(text);
  const revision = KnowledgeRevisionSchema.parse(meta);
  const nl = rest.indexOf("\n");
  if (!rest.startsWith(MODULE_FRONTMATTER) || nl < 0 || !rest.slice(0, nl).endsWith(" -->")) {
    throw new Error("missing module frontmatter marker");
  }
  const front = JSON.parse(rest.slice(MODULE_FRONTMATTER.length, nl - 4)) as unknown;
  if (front !== null && typeof front !== "string") throw new Error("malformed module frontmatter marker");
  const body = rest.slice(nl + 1);
  return { revision, markdown: front === null ? body : `---\n${front}\n---\n${body}` };
}

// --- reads ----------------------------------------------------------------------

export async function loadEntry(entryId: string): Promise<KnowledgeEntry | null> {
  assertSafeId(entryId, "entry_id");
  return readJson(currentFile(entryId), KnowledgeEntrySchema);
}

async function listEntryIds(): Promise<string[]> {
  try {
    return (await fs.readdir(entriesRoot())).filter(isValidId).sort();
  } catch (err) {
    if (isErrno(err, "ENOENT")) return [];
    throw err;
  }
}

/** Every entry with a current.json, ordered by entry_id. */
export async function listEntries(): Promise<KnowledgeEntry[]> {
  const out: KnowledgeEntry[] = [];
  for (const id of await listEntryIds()) {
    const entry = await loadEntry(id);
    if (entry) out.push(entry);
  }
  return out;
}

async function readRevisionFileAt(entryId: string, no: number): Promise<{ revision: KnowledgeRevision; markdown: string } | null> {
  const text = await readTextOrNull(revisionFile(entryId, no));
  return text === null ? null : parseRevisionFile(text);
}

async function revisionNumbers(entryId: string): Promise<number[]> {
  try {
    return (await fs.readdir(entryDir(entryId)))
      .map(f => /^rev-([1-9]\d*)\.md$/.exec(f)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  } catch (err) {
    if (isErrno(err, "ENOENT")) return [];
    throw err;
  }
}

/** All revisions of one entry, oldest first. */
export async function listRevisions(entryId: string): Promise<KnowledgeRevision[]> {
  assertSafeId(entryId, "entry_id");
  const out: KnowledgeRevision[] = [];
  for (const no of await revisionNumbers(entryId)) {
    const r = await readRevisionFileAt(entryId, no);
    if (r) out.push(r.revision);
  }
  return out;
}

export async function listAllRevisions(): Promise<KnowledgeRevision[]> {
  const out: KnowledgeRevision[] = [];
  for (const id of await listEntryIds()) out.push(...(await listRevisions(id)));
  return out;
}

export async function readRevisionByNo(entryId: string, no: number) {
  assertSafeId(entryId, "entry_id");
  return readRevisionFileAt(entryId, no);
}

/** The revision with this ID in this entry, or null. */
export async function readRevision(entryId: string, revisionId: string) {
  assertSafeId(entryId, "entry_id");
  assertSafeId(revisionId, "revision_id");
  for (const no of await revisionNumbers(entryId)) {
    const r = await readRevisionFileAt(entryId, no);
    if (r?.revision.revision_id === revisionId) return r;
  }
  return null;
}

/** Revision IDs are global; demo-scale lookup by scanning entries. */
export async function findRevision(revisionId: string) {
  assertSafeId(revisionId, "revision_id");
  for (const id of await listEntryIds()) {
    const r = await readRevision(id, revisionId);
    if (r) return r;
  }
  return null;
}

export async function readStatusLog(entryId: string): Promise<StatusTransition[]> {
  const text = await readTextOrNull(statusLogFile(entryId));
  if (text === null) return [];
  const out: StatusTransition[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = StatusTransitionSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // A torn final line (crash mid-append) is skipped.
    }
  }
  return out;
}

/** Status of a revision now: its last transition, else the status it was created with. */
export async function revisionStatus(revision: KnowledgeRevision, log?: StatusTransition[]): Promise<EntryStatus> {
  const transitions = (log ?? (await readStatusLog(revision.entry_id))).filter(t => t.revision_id === revision.revision_id);
  return transitions.length ? transitions[transitions.length - 1].to : revision.status;
}

// --- writes ---------------------------------------------------------------------

export class RevisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export type DraftToStore = {
  entry_id: string;
  markdown: string;
  evidence: KnowledgeRevision["evidence"];
  produced_by: ProducedBy;
  change_reason: string | null;
  session_id: string | null;
  /** When the module numbers revisions itself, it must match the store's next number. */
  revision_no?: number;
  /** When given, must be the entry's current revision (null = new entry). */
  parent_revision_id?: string | null;
};

export type RevisionPlan =
  | { kind: "unchanged"; revision: KnowledgeRevision }
  | { kind: "new"; revision: KnowledgeRevision; markdown: string; previous: KnowledgeEntry | null };

/** Decides what storing this draft would do, without writing. Call inside the knowledge lock. */
export async function planRevision(draft: DraftToStore, now: Date): Promise<RevisionPlan> {
  assertSafeId(draft.entry_id, "entry_id");
  const sha = sha256Hex(draft.markdown);
  const numbers = await revisionNumbers(draft.entry_id);
  const latestNo = numbers.length ? numbers[numbers.length - 1] : 0;
  const latest = latestNo ? await readRevisionFileAt(draft.entry_id, latestNo) : null;
  if (latest && (latest.revision.content_sha256 ?? sha256Hex(latest.markdown)) === sha) {
    return { kind: "unchanged", revision: latest.revision };
  }
  const previous = await loadEntry(draft.entry_id);
  const parent = previous?.current_revision_id ?? null;
  const no = latestNo + 1;
  if (draft.revision_no !== undefined && draft.revision_no !== no) {
    throw new RevisionConflictError(`${draft.entry_id}: module revision_no ${draft.revision_no}, store expects ${no}`);
  }
  if (draft.parent_revision_id !== undefined && draft.parent_revision_id !== parent) {
    throw new RevisionConflictError(`${draft.entry_id}: module parent does not match the current revision`);
  }
  const revision: KnowledgeRevision = {
    schema_version: SCHEMA_VERSION,
    entry_id: draft.entry_id,
    revision_id: newId("rev", now),
    revision_no: no,
    parent_revision_id: parent,
    status: "draft",
    content_path: `entries/${draft.entry_id}/rev-${no}.md`,
    evidence: {
      event_ids: [...draft.evidence.event_ids],
      exchange_ids: [...draft.evidence.exchange_ids],
      asset_ids: [...draft.evidence.asset_ids],
    },
    produced_by: { ...draft.produced_by },
    created_at_utc: now.toISOString(),
    session_id: draft.session_id,
    content_sha256: sha,
    change_reason: draft.change_reason,
  };
  return { kind: "new", revision: KnowledgeRevisionSchema.parse(revision), markdown: draft.markdown, previous };
}

/** Writes the immutable revision file first, then moves current.json to it. */
export async function commitRevision(plan: Extract<RevisionPlan, { kind: "new" }>, now: Date): Promise<void> {
  const { revision } = plan;
  const file = revisionFile(revision.entry_id, revision.revision_no);
  if ((await readTextOrNull(file)) !== null) throw new RevisionConflictError(`${revision.content_path} already exists`);
  await writeFileAtomic(file, renderRevisionFile(revision, plan.markdown));
  const entry: KnowledgeEntry = {
    entry_id: revision.entry_id,
    current_revision_id: revision.revision_id,
    current_revision_no: revision.revision_no,
    status: revision.status,
    updated_at_utc: now.toISOString(),
    rev: (plan.previous?.rev ?? 0) + 1,
  };
  await writeJsonAtomic(currentFile(revision.entry_id), entry);
}

/** Appends a status change; if it is the entry's current revision, current.json follows. */
export async function appendStatusTransition(
  t: { revision: KnowledgeRevision; to: EntryStatus; confirmation_id: string | null; reason?: string },
  now: Date,
): Promise<StatusTransition> {
  const record: StatusTransition = StatusTransitionSchema.parse({
    entry_id: t.revision.entry_id,
    revision_id: t.revision.revision_id,
    from: await revisionStatus(t.revision),
    to: t.to,
    at_utc: now.toISOString(),
    confirmation_id: t.confirmation_id,
    ...(t.reason !== undefined ? { reason: t.reason } : {}),
  });
  const file = statusLogFile(record.entry_id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(record) + "\n");
  const entry = await loadEntry(record.entry_id);
  if (entry && entry.current_revision_id === record.revision_id && entry.status !== record.to) {
    await writeJsonAtomic(currentFile(record.entry_id), {
      ...entry,
      status: record.to,
      updated_at_utc: record.at_utc,
      rev: entry.rev + 1,
    } satisfies KnowledgeEntry);
  }
  return record;
}

export const REDACTED_HEADING = "REDACTED — evidence deleted";

/**
 * Deletion beats immutability (S4): a revision quoting deleted or off-record evidence keeps its
 * frontmatter (IDs, hashes) but loses its body, so the expert's words are really gone.
 * Call inside `withKnowledgeLock`.
 */
export async function redactRevisionFile(revision: KnowledgeRevision, reason: string): Promise<void> {
  const body = `# ${REDACTED_HEADING}\n\n> This revision was revoked and its content removed (${reason}).\n`;
  await writeFileAtomic(revisionFile(revision.entry_id, revision.revision_no), renderRevisionFile(revision, body));
}

// --- workflow ---------------------------------------------------------------------

const WorkflowLinkSchema = z.object({
  position: z.number().int().min(1),
  entry_id: z.string(),
  revision_no: z.number().int().min(1),
  revision_id: z.string().nullable(),
  title: z.string().nullable(),
});
export type WorkflowLink = z.output<typeof WorkflowLinkSchema>;

const WorkflowLinkageSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  produced_by: ModuleInfoSchema,
  session_id: z.string(),
  job_id: z.string(),
  generated_at_utc: UtcSchema,
  links: z.array(WorkflowLinkSchema),
});
export type WorkflowLinkage = z.output<typeof WorkflowLinkageSchema>;

const ENTRY_LINK = /entries\/([a-z0-9][a-z0-9-]{0,63})\/rev-([1-9]\d*)\.md/g;

/** Ordered, unique `entries/<entry_id>/rev-<n>.md` links; the title is the line's first bold text. */
export function extractWorkflowLinks(markdown: string): Omit<WorkflowLink, "revision_id">[] {
  const out: Omit<WorkflowLink, "revision_id">[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split("\n")) {
    for (const m of line.matchAll(ENTRY_LINK)) {
      const key = `${m[1]}#${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ position: out.length + 1, entry_id: m[1], revision_no: Number(m[2]), title: /\*\*(.+?)\*\*/.exec(line)?.[1] ?? null });
    }
  }
  return out;
}

/** Regenerates `knowledge/workflow.md`: linkage frontmatter + the module's workflow Markdown. */
export async function writeWorkflow(
  input: { markdown: string; produced_by: ModuleInfo; session_id: string; job_id: string },
  now: Date,
): Promise<WorkflowLinkage> {
  const links: WorkflowLink[] = [];
  for (const l of extractWorkflowLinks(input.markdown)) {
    const r = await readRevisionFileAt(l.entry_id, l.revision_no).catch(() => null);
    links.push({ ...l, revision_id: r?.revision.revision_id ?? null });
  }
  const linkage: WorkflowLinkage = {
    schema_version: SCHEMA_VERSION,
    produced_by: input.produced_by,
    session_id: input.session_id,
    job_id: input.job_id,
    generated_at_utc: now.toISOString(),
    links,
  };
  const keys = Object.keys(WorkflowLinkageSchema.shape);
  await writeFileAtomic(workflowFile(), `${renderFrontmatter(linkage, keys)}\n${input.markdown}`);
  return linkage;
}

export async function readWorkflow(): Promise<WorkflowLinkage | null> {
  const text = await readTextOrNull(workflowFile());
  if (text === null) return null;
  return WorkflowLinkageSchema.parse(splitFrontmatter(text).meta);
}

// --- links ------------------------------------------------------------------------

/** Link targets in Markdown that are relative paths (not URLs, anchors or absolute paths). */
export function relativeLinkTargets(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\]\(<([^>\n]+)>\)|\]\(([^)\s]+)\)/g)) {
    const target = m[1] ?? m[2];
    if (target.startsWith("/") || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    out.push(target);
  }
  return out;
}

/** Relative links of an entry's Markdown that do not resolve to a file inside KNOWLEDGE_DIR. */
export async function unresolvedLocalLinks(entryId: string, markdown: string): Promise<string[]> {
  const root = path.resolve(getConfig().knowledgeDir);
  const base = entryDir(entryId);
  const out: string[] = [];
  for (const target of relativeLinkTargets(markdown)) {
    const resolved = path.resolve(base, decodeURI(target));
    const inside = resolved.startsWith(root + path.sep);
    const exists = inside && (await fs.stat(resolved).then(s => s.isFile(), () => false));
    if (!exists) out.push(target);
  }
  return out;
}

// --- views ------------------------------------------------------------------------

/** `GET /api/knowledge/entries/:id`: current.json plus every revision with its status now. */
export async function getEntryView(entryId: string) {
  const entry = await loadEntry(entryId);
  if (!entry) throw new ApiError("not_found", "Entry not found.", { entry_id: entryId });
  const log = await readStatusLog(entryId);
  const revisions = [];
  for (const r of await listRevisions(entryId)) {
    revisions.push({ revision_id: r.revision_id, revision_no: r.revision_no, status: await revisionStatus(r, log), created_at_utc: r.created_at_utc });
  }
  return { ...entry, revisions };
}

export async function getRevisionView(entryId: string, revisionId: string) {
  const found = await readRevision(entryId, revisionId);
  if (!found) throw new ApiError("not_found", "Revision not found.", { entry_id: entryId, revision_id: revisionId });
  return { revision: found.revision, status: await revisionStatus(found.revision), markdown: found.markdown };
}
