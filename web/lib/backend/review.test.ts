import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postMarkRoute } from "@/app/api/sessions/[sid]/review-marks/route";
import { GET as getReviewRoute } from "@/app/api/sessions/[sid]/review/route";
import { parseSessionReviewView } from "@/lib/contracts";
import { readBusAfter } from "./bus";
import { deleteSession } from "./cascade";
import { codeOf, errorOf } from "./capture-test-helpers";
import { putExchange } from "./exchanges";
import { findRevision, revisionStatus } from "./knowledge";
import { newNewcomer, seedConfirmedKnowledge, useNewcomerDirs } from "./learner-test-helpers";
import { getSessionReview, listReviewMarks, postReviewMark } from "./review";
import { changeLifecycle, createSession, getSession } from "./sessions";
import { getSessionDraft, requestSynthesis } from "./synthesis";
import { expertExchange } from "./synthesis-test-helpers";

let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ cleanup } = await useNewcomerDirs("ws6-review-"));
});
afterEach(() => cleanup());

const ctx = (sid: string) => ({ params: Promise.resolve({ sid }) });

async function seeded() {
  const { expertSid, revisionIds } = await seedConfirmedKnowledge({ synthesis: "stub" });
  const first = await findRevision(revisionIds[0]);
  if (!first) throw new Error("seed revision missing");
  return { sid: expertSid, revisionIds, entryId: first.revision.entry_id, revisionId: first.revision.revision_id };
}

describe("review marks (integration G10)", () => {
  it("stores a mark, emits review_mark.stored, and leaves the revision status alone", async () => {
    const { sid, entryId, revisionId } = await seeded();
    const statusBefore = await revisionStatus((await findRevision(revisionId))!.revision);
    const after = (await readBusAfter(sid, 0)).at(-1)!.seq;

    const r = await postReviewMark(sid, { entry_id: entryId, revision_id: revisionId, kind: "correction_requested", idempotency_key: "m-1" });
    expect(r.status).toBe(201);
    expect(r.mark).toMatchObject({ session_id: sid, entry_id: entryId, revision_id: revisionId, kind: "correction_requested" });
    expect(await listReviewMarks(sid)).toEqual([r.mark]);
    expect((await readBusAfter(sid, after)).map(e => [e.type, e.ids])).toEqual([
      ["review_mark.stored", { mark_id: r.mark.mark_id, entry_id: entryId, revision_id: revisionId }],
    ]);
    expect(await revisionStatus((await findRevision(revisionId))!.revision)).toBe(statusBefore);
  });

  it("same key + same body → 200 with the same mark and no new event; same key + other body → conflict_immutable", async () => {
    const { sid, entryId, revisionId } = await seeded();
    const body = { entry_id: entryId, revision_id: revisionId, kind: "flag_unresolved" as const, idempotency_key: "m-2" };
    const first = await postReviewMark(sid, body);
    const seq = (await readBusAfter(sid, 0)).at(-1)!.seq;
    const again = await postReviewMark(sid, body);
    expect(again).toEqual({ status: 200, mark: first.mark });
    expect(await readBusAfter(sid, seq)).toEqual([]);
    expect(await codeOf(postReviewMark(sid, { ...body, kind: "correction_requested" }))).toBe("conflict_immutable");
    expect(await listReviewMarks(sid)).toHaveLength(1);
  });

  it("refuses unknown revisions, mismatched entries, other sessions' revisions, newcomer and aborted sessions", async () => {
    const { sid, entryId, revisionId } = await seeded();
    const base = { entry_id: entryId, revision_id: revisionId, kind: "flag_unresolved" as const };
    expect(await codeOf(postReviewMark(sid, { ...base, revision_id: "rev-nope", idempotency_key: "a" }))).toBe("not_found");
    expect((await errorOf(postReviewMark(sid, { ...base, entry_id: "other-entry", idempotency_key: "b" }))).details).toMatchObject({
      reason: "entry_mismatch",
    });

    const other = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
    expect((await errorOf(postReviewMark(other, { ...base, idempotency_key: "c" }))).details).toMatchObject({ reason: "revision_not_in_session" });

    const newcomer = await newNewcomer();
    expect((await errorOf(postReviewMark(newcomer.session_id, { ...base, idempotency_key: "d" }))).details).toMatchObject({
      reason: "not_expert_session",
    });

    await changeLifecycle(sid, { action: "abort", rev: (await getSession(sid)).rev });
    expect(await codeOf(postReviewMark(sid, { ...base, idempotency_key: "e" }))).toBe("invalid_transition");
  });

  it("POST /api/sessions/:sid/review-marks → 201, replay 200, bad body 400", async () => {
    const { sid, entryId, revisionId } = await seeded();
    const post = (body: unknown) =>
      postMarkRoute(new Request("http://t", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(sid));
    const body = { entry_id: entryId, revision_id: revisionId, kind: "correction_requested", idempotency_key: "r-1" };
    expect((await post(body)).status).toBe(201);
    expect((await post(body)).status).toBe(200);
    expect((await post({ ...body, kind: "approve" })).status).toBe(400);
  });
});

describe("session review view (integration G9)", () => {
  it("returns the draft revisions as steps with gaps, confirmations and marks, and parses with its schema", async () => {
    const { sid, revisionIds, entryId, revisionId } = await seeded();
    const { mark } = await postReviewMark(sid, { entry_id: entryId, revision_id: revisionId, kind: "flag_unresolved", idempotency_key: "v-1" });

    const view = await getSessionReview(sid);
    expect(parseSessionReviewView(view).ok).toBe(true);
    expect(view.session_id).toBe(sid);
    expect(view.revision_ids).toEqual(revisionIds);
    expect(view.current.map(s => s.revision_id)).toEqual(revisionIds);
    expect(view.current.every(s => s.status === "confirmed" && s.is_current)).toBe(true);
    expect(view.previous).toEqual([]);
    expect(view.confirmations.map(c => c.reviewed_revision_id).sort()).toEqual([...revisionIds].sort());
    expect(view.review_marks).toEqual([mark]);
    expect(Array.isArray(view.gaps)).toBe(true);
  });

  it("after a correction the new revisions are current and their parents are in previous", async () => {
    const { sid, revisionIds } = await seeded();
    // The expert corrects the reason; re-synthesis creates new revisions whose parents are the confirmed ones.
    await putExchange(
      sid,
      "x-2",
      expertExchange(sid, "x-2", "evt-002", ["Because FIXTURE cue D is present.", "I never save it when FIXTURE condition C is visible."], {
        kind: "reasoning",
        asked_at_utc: "2026-10-03T10:00:25.000Z",
        rev: 2,
      }),
    );
    const job = await (await requestSynthesis(sid)).done;
    expect(job.status).toBe("done");
    const draft = await getSessionDraft(sid);
    const view = await getSessionReview(sid);
    expect(view.revision_ids).toEqual(draft.revision_ids);
    const changed = view.current.filter(s => !revisionIds.includes(s.revision_id ?? ""));
    expect(changed.length).toBeGreaterThan(0);
    for (const step of changed) {
      const parent = (await findRevision(step.revision_id!))!.revision.parent_revision_id;
      expect(parent).not.toBeNull();
      expect(view.previous.map(p => p.revision_id)).toContain(parent);
    }
  });

  it("newcomer sessions → not_found; unknown → not_found; deleted → gone (marks go with the session)", async () => {
    const { sid, entryId, revisionId } = await seeded();
    await postReviewMark(sid, { entry_id: entryId, revision_id: revisionId, kind: "flag_unresolved", idempotency_key: "g-1" });
    const newcomer = await newNewcomer();
    expect(await codeOf(getSessionReview(newcomer.session_id))).toBe("not_found");
    expect(await codeOf(getSessionReview("ses-nope"))).toBe("not_found");
    await deleteSession(sid);
    expect(await codeOf(getSessionReview(sid))).toBe("gone");
  });

  it("GET /api/sessions/:sid/review → 200 JSON", async () => {
    const { sid } = await seeded();
    const res = await getReviewRoute(new Request("http://t"), ctx(sid));
    expect(res.status).toBe(200);
    expect(parseSessionReviewView(await res.json()).ok).toBe(true);
  });
});
