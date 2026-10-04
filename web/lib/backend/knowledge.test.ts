import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseKnowledgeRevision, type KnowledgeRevision } from "@/lib/contracts";
import { useTempDirs } from "./capture-test-helpers";
import { getConfig } from "./config";
import {
  appendStatusTransition,
  commitRevision,
  extractWorkflowLinks,
  findRevision,
  listEntries,
  listRevisions,
  loadEntry,
  parseRevisionFile,
  planRevision,
  readRevision,
  readWorkflow,
  relativeLinkTargets,
  renderRevisionFile,
  revisionFile,
  revisionStatus,
  RevisionConflictError,
  sha256Hex,
  unresolvedLocalLinks,
  withKnowledgeLock,
  writeWorkflow,
  type DraftToStore,
} from "./knowledge";

let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-knowledge-"));
});
afterEach(() => cleanup());

const NOW = new Date("2026-10-04T10:15:00.000Z");

const WS5_MD = [
  "---",
  'schema_version: "ws5.v0"',
  'entry_id: "ent-1"',
  'revision_id: "rev-1"',
  "---",
  "",
  "# step `ent-1` · rev-1",
  "",
  '> "verbatim words -->"',
  "",
].join("\n");

const draft = (overrides: Partial<DraftToStore> = {}): DraftToStore => ({
  entry_id: "ent-1",
  markdown: WS5_MD,
  evidence: { event_ids: ["evt-1"], exchange_ids: ["x-1"], asset_ids: ["a-1"] },
  produced_by: { module: "ws5-synthesis", version: "0.2.0", source: "fixture" },
  change_reason: null,
  session_id: "ses-1",
  ...overrides,
});

async function store(d: DraftToStore, now = NOW) {
  return withKnowledgeLock(async () => {
    const plan = await planRevision(d, now);
    if (plan.kind === "new") await commitRevision(plan, now);
    return plan;
  });
}

describe("revision file format", () => {
  const revision: KnowledgeRevision = {
    schema_version: "ws6.v0",
    entry_id: "ent-1",
    revision_id: "rev-20261004101500-a3f9k2",
    revision_no: 1,
    parent_revision_id: null,
    status: "draft",
    content_path: "entries/ent-1/rev-1.md",
    evidence: { event_ids: [], exchange_ids: [], asset_ids: [] },
    produced_by: { module: "m", version: "1", source: "stub" },
    created_at_utc: NOW.toISOString(),
    session_id: "ses-1",
    content_sha256: sha256Hex(WS5_MD),
    change_reason: null,
  };

  it.each([
    ["with module frontmatter", WS5_MD],
    ["without frontmatter", "# STUB\n\n> line\n"],
    ["with a broken frontmatter opener", "---\nnot closed\n"],
    ["empty", ""],
  ])("round-trips the module Markdown byte-for-byte (%s)", (_name, md) => {
    const text = renderRevisionFile(revision, md);
    const parsed = parseRevisionFile(text);
    expect(parsed.markdown).toBe(md);
    expect(parsed.revision).toEqual(revision);
  });

  it("has exactly one frontmatter block, so a Markdown viewer renders the body cleanly", () => {
    const text = renderRevisionFile(revision, WS5_MD);
    expect(text.split("\n").filter(l => l === "---")).toHaveLength(2);
    expect(text.startsWith("---\n")).toBe(true);
    expect(text).not.toContain("verbatim words -->\n-->");
  });

  it("rejects a file without valid WS6 frontmatter", () => {
    expect(() => parseRevisionFile("# no frontmatter")).toThrow();
    expect(() => parseRevisionFile("---\nentry_id: 1\n---\n")).toThrow();
  });
});

describe("planRevision / commitRevision", () => {
  it("writes rev-1 with valid frontmatter, then current.json", async () => {
    const plan = await store(draft());
    expect(plan.kind).toBe("new");
    const text = await fsp.readFile(revisionFile("ent-1", 1), "utf8");
    const { revision, markdown } = parseRevisionFile(text);
    expect(parseKnowledgeRevision(revision).ok).toBe(true);
    expect(revision).toMatchObject({
      entry_id: "ent-1",
      revision_no: 1,
      parent_revision_id: null,
      status: "draft",
      content_path: "entries/ent-1/rev-1.md",
      session_id: "ses-1",
      content_sha256: sha256Hex(WS5_MD),
    });
    expect(revision.revision_id).toMatch(/^rev-\d{14}-[a-z0-9]{6}$/);
    expect(markdown).toBe(WS5_MD);
    expect(await loadEntry("ent-1")).toMatchObject({
      current_revision_id: revision.revision_id,
      current_revision_no: 1,
      status: "draft",
      rev: 1,
    });
  });

  it("identical content is not stored again", async () => {
    const first = await store(draft());
    const again = await store(draft());
    expect(again.kind).toBe("unchanged");
    expect(again.revision.revision_id).toBe(first.revision.revision_id);
    expect(await fsp.readdir(path.dirname(revisionFile("ent-1", 1)))).toEqual(["current.json", "rev-1.md"]);
  });

  it("changed content becomes rev-2 with parent = rev-1", async () => {
    const first = await store(draft());
    const second = await store(draft({ markdown: WS5_MD + "more\n", change_reason: "support changed" }));
    expect(second.kind).toBe("new");
    expect(second.revision).toMatchObject({
      revision_no: 2,
      parent_revision_id: first.revision.revision_id,
      change_reason: "support changed",
    });
    expect(await loadEntry("ent-1")).toMatchObject({ current_revision_id: second.revision.revision_id, rev: 2 });
    expect((await listRevisions("ent-1")).map(r => r.revision_no)).toEqual([1, 2]);
  });

  it("a module revision_no or parent that does not follow the store is a conflict", async () => {
    const first = await store(draft());
    await expect(store(draft({ markdown: "x", revision_no: 3 }))).rejects.toBeInstanceOf(RevisionConflictError);
    await expect(store(draft({ markdown: "x", parent_revision_id: "rev-other" }))).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    await expect(store(draft({ markdown: "x", revision_no: 2, parent_revision_id: first.revision.revision_id }))).resolves.toMatchObject({
      kind: "new",
    });
  });

  it("rejects an unsafe entry_id", async () => {
    await expect(store(draft({ entry_id: "../x" }))).rejects.toThrow();
  });
});

describe("reads", () => {
  it("lists entries, reads a revision and finds one by id", async () => {
    const a = await store(draft());
    await store(draft({ entry_id: "ent-2" }));
    expect((await listEntries()).map(e => e.entry_id)).toEqual(["ent-1", "ent-2"]);
    expect((await readRevision("ent-1", a.revision.revision_id))?.markdown).toBe(WS5_MD);
    expect((await findRevision(a.revision.revision_id))?.revision.entry_id).toBe("ent-1");
    expect(await findRevision("rev-unknown")).toBeNull();
    expect(await readRevision("ent-2", a.revision.revision_id)).toBeNull();
  });
});

describe("status transitions", () => {
  it("record the change without touching the revision file", async () => {
    const plan = await store(draft());
    const file = revisionFile("ent-1", 1);
    const before = await fsp.readFile(file, "utf8");
    await withKnowledgeLock(() =>
      appendStatusTransition({ revision: plan.revision, to: "confirmed", confirmation_id: "cnf-1" }, NOW),
    );
    expect(await fsp.readFile(file, "utf8")).toBe(before);
    expect(await revisionStatus(plan.revision)).toBe("confirmed");
    expect(await loadEntry("ent-1")).toMatchObject({ status: "confirmed", rev: 2 });
  });

  it("a transition on a non-current revision leaves current.json alone", async () => {
    const one = await store(draft());
    await store(draft({ markdown: "changed" }));
    await withKnowledgeLock(() =>
      appendStatusTransition({ revision: one.revision, to: "unresolved", confirmation_id: "cnf-1" }, NOW),
    );
    expect(await revisionStatus(one.revision)).toBe("unresolved");
    expect(await loadEntry("ent-1")).toMatchObject({ status: "draft", current_revision_no: 2 });
  });
});

describe("workflow linkage", () => {
  const WORKFLOW = [
    "# Workflow",
    "",
    "1. **Decision at evt-001** — [`ent-1` · rev-1](<entries/ent-1/rev-1.md>) · draft",
    "2. **Step at evt-002** — [`ent-2` · rev-4](<entries/ent-2/rev-4.md>) · draft",
    "3. repeat [x](<entries/ent-1/rev-1.md>)",
    "",
  ].join("\n");

  it("extracts ordered, unique entry links with their titles", () => {
    expect(extractWorkflowLinks(WORKFLOW)).toEqual([
      { position: 1, entry_id: "ent-1", revision_no: 1, title: "Decision at evt-001" },
      { position: 2, entry_id: "ent-2", revision_no: 4, title: "Step at evt-002" },
    ]);
  });

  it("writes workflow.md with the linked revision IDs (unknown ones as null)", async () => {
    const a = await store(draft());
    const produced_by = { id: "ws5-synthesis", version: "0.2.0", source: "live" as const };
    await withKnowledgeLock(() => writeWorkflow({ markdown: WORKFLOW, produced_by, session_id: "ses-1", job_id: "job-1" }, NOW));
    const text = await fsp.readFile(path.join(getConfig().knowledgeDir, "workflow.md"), "utf8");
    expect(text).toContain(WORKFLOW);
    const linkage = await readWorkflow();
    expect(linkage?.links).toEqual([
      { position: 1, entry_id: "ent-1", revision_no: 1, revision_id: a.revision.revision_id, title: "Decision at evt-001" },
      { position: 2, entry_id: "ent-2", revision_no: 4, revision_id: null, title: "Step at evt-002" },
    ]);
    expect(linkage).toMatchObject({ session_id: "ses-1", job_id: "job-1", produced_by });
  });

  it("readWorkflow is null before the first synthesis", async () => {
    expect(await readWorkflow()).toBeNull();
  });
});

describe("local links", () => {
  it("finds relative link targets and reports the ones that do not resolve", async () => {
    const dir = path.join(getConfig().knowledgeDir, "images", "a-1");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "original.png"), "x");
    const md = [
      "![h](<../../images/a-1/highlighted.png>) [o](<../../images/a-1/original.png>)",
      "[web](https://example.com) [anchor](#x) [abs](/api/assets/a-1/original) ![plain](../../images/a-1/original.png)",
      "[escape](<../../../web/.env>)",
    ].join("\n");
    expect(relativeLinkTargets(md)).toEqual([
      "../../images/a-1/highlighted.png",
      "../../images/a-1/original.png",
      "../../images/a-1/original.png",
      "../../../web/.env",
    ]);
    expect(await unresolvedLocalLinks("ent-1", md)).toEqual(["../../images/a-1/highlighted.png", "../../../web/.env"]);
  });
});
