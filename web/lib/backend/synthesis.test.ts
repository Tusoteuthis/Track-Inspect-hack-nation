import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseKnowledgeRevision, type Job } from "@/lib/contracts";
import { readBusAfter } from "./bus";
import { codeOf, newExpertSession, useTempDirs } from "./capture-test-helpers";
import { getConfig } from "./config";
import { putExchange } from "./exchanges";
import { newId } from "./ids";
import { sessionFile } from "./paths";
import { loadJob, saveJob } from "./jobs";
import {
  listAllRevisions,
  listEntries,
  parseRevisionFile,
  readWorkflow,
  revisionFile,
  unresolvedLocalLinks,
} from "./knowledge";
import { SYNTHESIS_PROVIDERS, setSynthesisProviderForTests, type SynthesisModule, type SynthesisProvider } from "./modules";
import { changeLifecycle, createSession } from "./sessions";
import { getGaps, getSessionDraft, requestSynthesis } from "./synthesis";
import { STUB_HEADING, stubEntryId } from "./synthesis-stub";
import { expertExchange, seedCapture } from "./synthesis-test-helpers";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-synthesis-"));
  sid = await newExpertSession();
  await seedCapture(sid);
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

const run = async () => (await requestSynthesis(sid)).done;
const entryFiles = async () => {
  const root = path.join(getConfig().knowledgeDir, "entries");
  const dirs = await fsp.readdir(root).catch(() => [] as string[]);
  const files = await Promise.all(dirs.map(async d => (await fsp.readdir(path.join(root, d))).map(f => `${d}/${f}`)));
  return files.flat().sort();
};
const busTypes = async () => (await readBusAfter(sid, 0)).map(e => e.type).filter(t => !/^(asset|event|exchange)\./.test(t));

async function readRev(entryId: string, no: number) {
  return parseRevisionFile(await fsp.readFile(revisionFile(entryId, no), "utf8"));
}

describe("stub synthesis", () => {
  beforeEach(() => setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.stub));

  it("creates rev-1 with valid frontmatter, verbatim lines, STUB marking and resolvable image links", async () => {
    const job = await run();
    expect(job).toMatchObject({ status: "done", module: { id: "ws6-stub-synthesis", source: "stub" } });
    const entryId = stubEntryId(sid);
    const { revision, markdown } = await readRev(entryId, 1);
    expect(parseKnowledgeRevision(revision).ok).toBe(true);
    expect(revision).toMatchObject({
      revision_no: 1,
      status: "draft",
      session_id: sid,
      produced_by: { source: "stub" },
      evidence: { event_ids: ["evt-001", "evt-002"], exchange_ids: ["x-1", "x-2"], asset_ids: ["a-1", "a-2"] },
    });
    expect(job.revision_ids).toEqual([revision.revision_id]);
    expect(markdown).toContain(`# ${STUB_HEADING}`);
    expect(markdown).toContain("> I never save it when FIXTURE condition C is visible.");
    expect(markdown).toContain("../../images/a-1/highlighted.png");
    expect(await unresolvedLocalLinks(entryId, markdown)).toEqual([]);

    const linkage = await readWorkflow();
    expect(linkage?.links).toEqual([expect.objectContaining({ entry_id: entryId, revision_no: 1, revision_id: revision.revision_id })]);
    expect(await getSessionDraft(sid)).toMatchObject({ job_id: job.job_id, revision_ids: [revision.revision_id], teach_back: null });
    expect(await getGaps(sid)).toMatchObject({ job_id: job.job_id, gaps: [], produced_by: { source: "stub" } });
    expect(await busTypes()).toEqual(["synthesis.started", "revision.created", "synthesis.done", "draft.updated", "gaps.updated"]);
  });

  it("re-running on unchanged inputs creates no new revision", async () => {
    await run();
    const before = await entryFiles();
    const again = await run();
    expect(again).toMatchObject({ status: "done", revision_ids: [] });
    expect(await entryFiles()).toEqual(before);
    expect((await readWorkflow())?.links[0].revision_no).toBe(1);
  });

  it("a changed exchange produces rev-2 with parent rev-1", async () => {
    const first = await run();
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["FIXTURE: here I read FIXTURE pattern A.", "More."], { rev: 2 }));
    const second = await run();
    const { revision } = await readRev(stubEntryId(sid), 2);
    expect(second.revision_ids).toEqual([revision.revision_id]);
    expect(revision.parent_revision_id).toBe(first.revision_ids[0]);
  });
});

describe("real WS5 synthesis", () => {
  beforeEach(() => setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.real));

  it("is the default provider", () => {
    setSynthesisProviderForTests(null);
    expect(SYNTHESIS_PROVIDERS.real.info).toMatchObject({ id: "ws5-synthesis", source: "live" });
  });

  it("creates rev-1 entries whose frontmatter is valid and whose image links resolve", async () => {
    const job = await run();
    expect(job.status).toBe("done");
    const revisions = await listAllRevisions();
    expect(revisions.length).toBeGreaterThan(0);
    for (const r of revisions) {
      expect(r.revision_no).toBe(1);
      expect(parseKnowledgeRevision(r).ok).toBe(true);
      const { markdown } = await readRev(r.entry_id, 1);
      expect(markdown.startsWith('---\nschema_version: "ws5.v0"')).toBe(true);
      expect(await unresolvedLocalLinks(r.entry_id, markdown)).toEqual([]);
      expect(r.produced_by).toMatchObject({ module: "ws5-synthesis", source: "fixture" });
      expect(r.evidence.asset_ids.length).toBe(r.evidence.event_ids.length);
    }
    const draft = await getSessionDraft(sid);
    expect(draft.teach_back).toEqual(expect.any(String));
    expect(draft.revision_ids.length).toBeGreaterThan(0);
    const ids = new Set(revisions.map(r => r.revision_id));
    for (const id of draft.revision_ids) expect(ids.has(id)).toBe(true);
    const linkage = await readWorkflow();
    expect(linkage?.links.every(l => l.revision_id !== null)).toBe(true);
  });

  it("re-running on unchanged inputs creates no new revision", async () => {
    await run();
    const before = await entryFiles();
    expect((await run()).revision_ids).toEqual([]);
    expect(await entryFiles()).toEqual(before);
  });
});

describe("job control", () => {
  function gatedProvider(): { provider: SynthesisProvider; called: Promise<void>; release: () => void } {
    let release!: () => void;
    let markCalled!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const called = new Promise<void>(r => (markCalled = r));
    const provider: SynthesisProvider = {
      info: SYNTHESIS_PROVIDERS.stub.info,
      create(host) {
        const inner = SYNTHESIS_PROVIDERS.stub.create(host);
        return {
          ...inner,
          async synthesize(input) {
            markCalled();
            await gate;
            return inner.synthesize(input);
          },
        };
      },
    };
    return { provider, called, release };
  }

  it("an exchange updated during a running job discards it; nothing is persisted", async () => {
    const g = gatedProvider();
    setSynthesisProviderForTests(g.provider);
    const req = await requestSynthesis(sid);
    await g.called;
    expect((await loadJob(req.job_id))?.status).toBe("running");
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["changed"], { rev: 2 }));
    g.release();
    const job = await req.done;
    expect(job).toMatchObject({ status: "discarded", discard_reason: "exchange_changed:x-1", revision_ids: [] });
    expect(await entryFiles()).toEqual([]);
    expect(await readWorkflow()).toBeNull();
    expect(await busTypes()).toEqual(["synthesis.started", "synthesis.discarded"]);
  });

  it("one queued/running job per session: a second request returns the same job_id", async () => {
    const g = gatedProvider();
    setSynthesisProviderForTests(g.provider);
    const a = await requestSynthesis(sid);
    const b = await requestSynthesis(sid);
    expect(b).toMatchObject({ job_id: a.job_id, created: false });
    g.release();
    await a.done;
    const c = await requestSynthesis(sid);
    expect(c.job_id).not.toBe(a.job_id);
    await c.done;
  });

  function providerReturning(fn: SynthesisModule["synthesize"]): SynthesisProvider {
    return { info: SYNTHESIS_PROVIDERS.stub.info, create: () => ({ id: "t", version: "1", synthesize: fn }) };
  }
  const oneDraft = (overrides: object = {}) => ({
    revisions: [
      {
        entry_id: "ent-t",
        markdown: "# t\n",
        evidence: { event_ids: ["evt-001"], exchange_ids: ["x-1"], asset_ids: ["a-1"] },
        produced_by: { module: "t", version: "1", source: "stub" as const },
        change_reason: null,
        ...overrides,
      },
    ],
    workflow_markdown: "1. [t](<entries/ent-t/rev-1.md>)",
    gaps: [],
    teach_back: null,
  });

  it("a module error fails the job without persisting or leaking the message", async () => {
    setSynthesisProviderForTests(
      providerReturning(() => Promise.reject(new Error("FIXTURE expert words in an error"))),
    );
    const job = await run();
    expect(job).toMatchObject({ status: "failed", error: { code: "module_error" } });
    expect(JSON.stringify(job)).not.toContain("FIXTURE");
    expect(await entryFiles()).toEqual([]);
    expect(await busTypes()).toEqual(["synthesis.started", "synthesis.failed"]);
  });

  it.each([
    ["a revision_no that does not follow the store", { revision_no: 3 }, "revision_conflict"],
    ["an asset not stored for the session", { evidence: { event_ids: [], exchange_ids: [], asset_ids: ["a-9"] } }, "dangling_reference"],
    ["an unknown exchange", { evidence: { event_ids: [], exchange_ids: ["x-9"], asset_ids: [] } }, "dangling_reference"],
    ["an unsafe entry_id", { entry_id: "../x" }, "invalid_output"],
  ])("fails on %s", async (_name, overrides, code) => {
    setSynthesisProviderForTests(providerReturning(async () => oneDraft(overrides)));
    expect((await run()).error?.code).toBe(code);
    expect(await entryFiles()).toEqual([]);
  });

  it("marks a job left running by a restart as interrupted", async () => {
    setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.stub);
    const stale: Job = {
      job_id: newId("job"),
      session_id: sid,
      kind: "synthesis",
      status: "running",
      module: SYNTHESIS_PROVIDERS.stub.info,
      input_revs: null,
      revision_ids: [],
      created_at_utc: "2026-10-03T00:00:00.000Z",
      started_at_utc: "2026-10-03T00:00:00.000Z",
      finished_at_utc: null,
      error: null,
      discard_reason: null,
    };
    await saveJob(stale);
    const job = await run();
    expect(job.status).toBe("done");
    expect(await loadJob(stale.job_id)).toMatchObject({ status: "failed", error: { code: "interrupted" } });
  });

  it("refuses newcomer and aborted sessions", async () => {
    // Newcomer creation is Sprint 3; write the record directly.
    const newcomer = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
    const file = sessionFile(newcomer);
    await fsp.writeFile(file, JSON.stringify({ ...JSON.parse(await fsp.readFile(file, "utf8")), role: "newcomer" }));
    expect(await codeOf(requestSynthesis(newcomer))).toBe("invalid_transition");
    await changeLifecycle(sid, { action: "abort", rev: 1 });
    expect(await codeOf(requestSynthesis(sid))).toBe("invalid_transition");
    expect(await codeOf(requestSynthesis("ses-unknown"))).toBe("not_found");
  });

  it("job records carry no expert words", async () => {
    setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.stub);
    const job = await run();
    expect(JSON.stringify(await loadJob(job.job_id))).not.toMatch(/FIXTURE/);
    expect((await listEntries()).length).toBe(1);
  });
});
