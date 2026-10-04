import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBusAfter } from "./bus";
import { errorOf, newExpertSession, useTempDirs } from "./capture-test-helpers";
import { getConfig } from "./config";
import { listConfirmations, postConfirmation } from "./confirmations";
import { putExchange } from "./exchanges";
import { findRevision, listRevisions, loadEntry, revisionFile, revisionStatus } from "./knowledge";
import { SYNTHESIS_PROVIDERS, setSynthesisProviderForTests } from "./modules";
import { sessionRecordFile } from "./paths";
import { getSessionDraft, requestSynthesis } from "./synthesis";
import { stubEntryId } from "./synthesis-stub";
import { expertExchange, seedCapture } from "./synthesis-test-helpers";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-confirm-"));
  sid = await newExpertSession();
  await seedCapture(sid);
  setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.stub);
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

const synth = async () => (await requestSynthesis(sid)).done;
const teachBack = (xid = "x-tb", lines = ["Yes, that's right."]) =>
  putExchange(sid, xid, expertExchange(sid, xid, null, lines, { phase: "teach_back", asked_at_utc: "2026-10-03T10:05:00.000Z" }));
const body = (revisionIds: string[], overrides: Record<string, unknown> = {}) => ({
  reviewed_revision_ids: revisionIds,
  result: "confirmed",
  expert_response_exchange_id: "x-tb",
  idempotency_key: "tb-1",
  ...overrides,
});
const confirmationFiles = async () =>
  fsp.readdir(path.join(getConfig().knowledgeDir, "confirmations")).catch(() => [] as string[]);

describe("postConfirmation", () => {
  it("confirming the current revision → confirmed (status record; revision file unchanged)", async () => {
    const job = await synth();
    const [revId] = job.revision_ids;
    await teachBack();
    const file = revisionFile(stubEntryId(sid), 1);
    const before = await fsp.readFile(file, "utf8");

    const res = await postConfirmation(body([revId]));
    expect(res.status).toBe(201);
    expect(res.confirmations).toEqual([
      expect.objectContaining({
        reviewed_revision_id: revId,
        result: "confirmed",
        expert_response_exchange_id: "x-tb",
        session_id: sid,
        entry_id: stubEntryId(sid),
        source: "fixture",
      }),
    ]);
    expect(await fsp.readFile(file, "utf8")).toBe(before);
    const found = await findRevision(revId);
    expect(await revisionStatus(found!.revision)).toBe("confirmed");
    expect(await loadEntry(stubEntryId(sid))).toMatchObject({ status: "confirmed" });
    const bus = (await readBusAfter(sid, 0)).filter(e => e.type === "confirmation.stored");
    expect(bus.map(e => e.ids)).toEqual([{ confirmation_ids: [res.confirmations[0].confirmation_id], revision_ids: [revId] }]);
  });

  it("a revision superseded after review → 409 stale_revision, current IDs listed, no status change", async () => {
    const [rev1] = (await synth()).revision_ids;
    // The expert reviewed rev-1 …
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["FIXTURE: here I read FIXTURE pattern A.", "Correction."], { rev: 2 }));
    const [rev2] = (await synth()).revision_ids; // … but rev-2 became current meanwhile.
    await teachBack();

    const err = await errorOf(postConfirmation(body([rev1])));
    expect(err.code).toBe("stale_revision");
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ stale_revision_ids: [rev1], current_revision_ids: [rev2] });
    expect(await confirmationFiles()).toEqual([]);
    for (const r of await listRevisions(stubEntryId(sid))) expect(await revisionStatus(r)).toBe("draft");
    expect(await loadEntry(stubEntryId(sid))).toMatchObject({ status: "draft", current_revision_id: rev2 });
    // The client cannot override it, not even with a fresh key.
    expect((await errorOf(postConfirmation(body([rev1], { idempotency_key: "tb-2" })))).code).toBe("stale_revision");
  });

  it.each([
    ["missing", "exchange_not_found"],
    ["off-record", "exchange_off_record"],
    ["unanswered", "exchange_no_answer"],
    ["in another session", "exchange_not_found"],
  ])("a %s response exchange cannot confirm (400, nothing stored)", async (kind, reason) => {
    const [revId] = (await synth()).revision_ids;
    if (kind === "off-record") {
      // Off-record exchanges are never stored by the API; simulate a leftover file.
      const x = expertExchange(sid, "x-tb", null, ["Yes."], { phase: "teach_back", record_state: "off_record" });
      await fsp.mkdir(path.dirname(sessionRecordFile(sid, "exchanges", "x-tb")), { recursive: true });
      await fsp.writeFile(sessionRecordFile(sid, "exchanges", "x-tb"), JSON.stringify(x));
    }
    if (kind === "unanswered") await teachBack("x-tb", ["   "]);
    if (kind === "in another session") {
      const other = await newExpertSession();
      await putExchange(other, "x-tb", expertExchange(other, "x-tb", null, ["Yes."], { phase: "teach_back" }));
    }
    const err = await errorOf(postConfirmation(body([revId])));
    expect(err.status).toBe(400);
    expect(err.details).toMatchObject({ reason });
    expect(await confirmationFiles()).toEqual([]);
    expect(await loadEntry(stubEntryId(sid))).toMatchObject({ status: "draft" });
  });

  it("replaying a confirmation is idempotent; the same key with another body is a conflict", async () => {
    const [revId] = (await synth()).revision_ids;
    await teachBack();
    const first = await postConfirmation(body([revId]));
    const again = await postConfirmation(body([revId]));
    expect(again).toEqual({ status: 200, confirmations: first.confirmations });
    expect(await listConfirmations()).toHaveLength(1);
    expect((await readBusAfter(sid, 0)).filter(e => e.type === "confirmation.stored")).toHaveLength(1);
    expect((await errorOf(postConfirmation(body([revId], { result: "unresolved" })))).code).toBe("conflict_immutable");
  });

  it("a replay completes a confirmation interrupted after its plan was recorded", async () => {
    const [revId] = (await synth()).revision_ids;
    await teachBack();
    const first = await postConfirmation(body([revId]));
    // Simulate a crash after the idempotency record: the confirmation file is gone.
    await fsp.rm(path.join(getConfig().knowledgeDir, "confirmations"), { recursive: true });
    await postConfirmation(body([revId]));
    expect((await listConfirmations()).map(c => c.confirmation_id)).toEqual([first.confirmations[0].confirmation_id]);
  });

  it("unresolved → unresolved", async () => {
    const [revId] = (await synth()).revision_ids;
    await teachBack("x-tb", ["I'm not sure about that."]);
    await postConfirmation(body([revId], { result: "unresolved" }));
    expect(await loadEntry(stubEntryId(sid))).toMatchObject({ status: "unresolved" });
  });

  it("accepts a WS3 ExpertConfirmation with its own confirmation_id", async () => {
    const [revId] = (await synth()).revision_ids;
    await teachBack();
    const res = await postConfirmation({
      confirmation_id: "cnf-ws3-1",
      revision_id: revId,
      status: "confirmed",
      step_ids_reviewed: [stubEntryId(sid)],
      expert_response_exchange_id: "x-tb",
      at_utc: "2026-10-03T10:06:00.000Z",
    });
    expect(res.confirmations[0]).toMatchObject({ confirmation_id: "cnf-ws3-1", at_utc: "2026-10-03T10:06:00.000Z" });
  });

  it("refuses unknown revisions, revisions of several sessions and steps outside the review", async () => {
    const [revId] = (await synth()).revision_ids;
    await teachBack();
    expect((await errorOf(postConfirmation(body(["rev-unknown"])))).code).toBe("not_found");
    expect((await errorOf(postConfirmation(body([revId], { step_ids_reviewed: ["ent-other"] })))).details).toMatchObject({
      reason: "step_not_reviewed",
    });

    const other = await newExpertSession();
    await seedCapture(other);
    const [otherRev] = (await requestSynthesis(other).then(r => r.done)).revision_ids;
    expect((await errorOf(postConfirmation(body([revId, otherRev])))).details).toMatchObject({ reason: "revision_sessions" });
  });
});

describe("correction flow with the real WS5 module", () => {
  beforeEach(() => setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.real));

  it("corrected → stays draft; re-synthesis produces rev-2 whose parent is the reviewed revision", async () => {
    await synth();
    const draft = await getSessionDraft(sid);
    const target = draft.reviewed[0];
    await teachBack("x-tb", ["No, FIXTURE pattern A also needs FIXTURE cue D."]);

    await postConfirmation({
      reviewed_revision_ids: draft.revision_ids,
      result: "corrected",
      expert_response_exchange_id: "x-tb",
      idempotency_key: "tb-correct",
      step_ids_reviewed: [target.entry_id],
    });
    const reviewed = await findRevision(target.revision_id);
    expect(await revisionStatus(reviewed!.revision)).toBe("draft");

    const job = await synth();
    expect(job.status).toBe("done");
    const revs = await listRevisions(target.entry_id);
    expect(revs.map(r => r.revision_no)).toEqual([1, 2]);
    expect(revs[1].parent_revision_id).toBe(target.revision_id);
    expect(await loadEntry(target.entry_id)).toMatchObject({ current_revision_id: revs[1].revision_id, status: "draft" });

    // Confirming the reviewed (now superseded) revision is refused.
    expect((await errorOf(postConfirmation(body([target.revision_id], { idempotency_key: "late" })))).code).toBe("stale_revision");
  });
});
