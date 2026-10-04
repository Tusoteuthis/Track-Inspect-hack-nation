import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getJob } from "@/app/api/jobs/[job_id]/route";
import { POST as postConfirmation } from "@/app/api/knowledge/confirmations/route";
import { GET as getEntry } from "@/app/api/knowledge/entries/[id]/route";
import { GET as getRevision } from "@/app/api/knowledge/entries/[id]/revisions/[rev]/route";
import { GET as listEntries } from "@/app/api/knowledge/entries/route";
import { GET as getDraft } from "@/app/api/sessions/[sid]/draft/route";
import { GET as getGaps } from "@/app/api/sessions/[sid]/gaps/route";
import { POST as postSynthesis } from "@/app/api/sessions/[sid]/synthesis/route";
import { GET as getWorkmap } from "@/app/api/workmap/route";
import { newExpertSession, useTempDirs } from "@/lib/backend/capture-test-helpers";
import { putExchange } from "@/lib/backend/exchanges";
import { SYNTHESIS_PROVIDERS, setSynthesisProviderForTests } from "@/lib/backend/modules";
import { requestSynthesis } from "@/lib/backend/synthesis";
import { expertExchange, seedCapture } from "@/lib/backend/synthesis-test-helpers";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-knowledge-routes-"));
  sid = await newExpertSession();
  await seedCapture(sid);
  setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.real);
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

const req = (url: string, init?: RequestInit) => new Request(`http://test${url}`, init);
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function synthesize(): Promise<string> {
  const res = await postSynthesis(req(`/api/sessions/${sid}/synthesis`, { method: "POST" }), params({ sid }));
  expect(res.status).toBe(202);
  const { job_id } = (await res.json()) as { job_id: string };
  // The route returns before the job finishes; wait on the same running job.
  await (await requestSynthesis(sid)).done;
  return job_id;
}

describe("knowledge routes", () => {
  it("synthesis → job → draft/gaps → entries → confirmation → Work Map", async () => {
    const jobId = await synthesize();
    const job = await (await getJob(req(`/api/jobs/${jobId}`), params({ job_id: jobId }))).json();
    expect(job).toMatchObject({ job_id: jobId, status: "done", session_id: sid });

    const draft = await (await getDraft(req(`/api/sessions/${sid}/draft`), params({ sid }))).json();
    expect(draft.revision_ids.length).toBeGreaterThan(0);
    expect(typeof draft.teach_back).toBe("string");
    const gaps = await (await getGaps(req(`/api/sessions/${sid}/gaps`), params({ sid }))).json();
    expect(gaps).toMatchObject({ session_id: sid, job_id: jobId, produced_by: { id: "ws5-synthesis" } });

    const entries = (await (await listEntries()).json()) as { entry_id: string; current_revision_id: string }[];
    expect(entries.length).toBeGreaterThan(0);
    const e = entries[0];
    const entry = await (await getEntry(req(`/api/knowledge/entries/${e.entry_id}`), params({ id: e.entry_id }))).json();
    expect(entry.revisions).toEqual([expect.objectContaining({ revision_id: e.current_revision_id, status: "draft" })]);
    const rev = await getRevision(req("/x"), params({ id: e.entry_id, rev: e.current_revision_id }));
    const revBody = await rev.json();
    expect(revBody).toMatchObject({ revision: { revision_id: e.current_revision_id }, status: "draft" });
    expect(revBody.markdown).toMatch(/^---\nschema_version: "ws5.v0"/);

    await putExchange(sid, "x-tb", expertExchange(sid, "x-tb", null, ["Yes."], { phase: "teach_back" }));
    const body = { reviewed_revision_ids: draft.revision_ids, result: "confirmed", expert_response_exchange_id: "x-tb", idempotency_key: "k1" };
    const created = await postConfirmation(req("/api/knowledge/confirmations", json(body)));
    expect(created.status).toBe(201);
    const replay = await postConfirmation(req("/api/knowledge/confirmations", json(body)));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await created.json());

    const map = await (await getWorkmap(req("/api/workmap"))).json();
    expect(map.steps.length).toBe(draft.revision_ids.length);
    expect(map.steps.every((s: { status: string }) => s.status === "confirmed")).toBe(true);
    const all = await (await getWorkmap(req("/api/workmap?include=draft"))).json();
    expect(all.include).toBe("draft");
  });

  it("maps errors to the envelope", async () => {
    const unknown = await postSynthesis(req("/x", { method: "POST" }), params({ sid: "ses-nope" }));
    expect(unknown.status).toBe(404);
    expect((await getJob(req("/x"), params({ job_id: "../x" }))).status).toBe(400);
    expect((await getJob(req("/x"), params({ job_id: "job-nope" }))).status).toBe(404);
    expect((await getEntry(req("/x"), params({ id: "ent-nope" }))).status).toBe(404);
    expect((await getRevision(req("/x"), params({ id: "ent-nope", rev: "rev-nope" }))).status).toBe(404);
    const bad = await postConfirmation(req("/x", json({ result: "confirmed" })));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("validation_failed");
    const notJson = await postConfirmation(req("/x", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);
  });

  it("a stale confirmation is a 409 with the current revision IDs", async () => {
    await synthesize();
    const draft = await (await getDraft(req("/x"), params({ sid }))).json();
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["FIXTURE: here I read FIXTURE pattern A.", "Unless FIXTURE cue E."], { rev: 2 }));
    await synthesize();
    await putExchange(sid, "x-tb", expertExchange(sid, "x-tb", null, ["Yes."], { phase: "teach_back" }));
    const res = await postConfirmation(
      req("/x", json({ reviewed_revision_ids: draft.revision_ids, result: "confirmed", expert_response_exchange_id: "x-tb", idempotency_key: "k" })),
    );
    expect(res.status).toBe(409);
    const err = (await res.json()).error;
    expect(err.code).toBe("stale_revision");
    expect(err.details.current_revision_ids.length).toBeGreaterThan(0);
  });
});
