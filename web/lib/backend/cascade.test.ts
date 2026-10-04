import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeRef } from "@/lib/contracts";
import { getAsset } from "./assets";
import { busFile, readBusAfter } from "./bus";
import { codeOf, makeEvent, makeExchange, seedAsset } from "./capture-test-helpers";
import { computeCascade, deleteAsset, deleteEvent, deleteExchange, deleteSession, revokeEntry, setRecordState, type CascadeGraph } from "./cascade";
import { commitDraft, putLearnerDraft, requestEvaluation } from "./learner";
import { getConfig } from "./config";
import { getEvent, putEvent } from "./events";
import { getExchange, putExchange } from "./exchanges";
import { listAllRevisions, readRevision, revisionStatus, REDACTED_HEADING } from "./knowledge";
import { loadEvaluation } from "./learner-store";
import { newNewcomer, seedConfirmedKnowledge, useNewcomerDirs } from "./learner-test-helpers";
import { SYNTHESIS_PROVIDERS, setSynthesisProviderForTests, type SynthesisProvider } from "./modules";
import { selectPinnedKnowledge } from "./newcomer";
import { assetDir, sessionDir, sessionRecordFile } from "./paths";
import { createSession, getSession } from "./sessions";
import { requestSynthesis } from "./synthesis";
import { expertExchange, seedAssetWithFiles } from "./synthesis-test-helpers";
import { readTombstone } from "./tombstones";
import { getWorkMap } from "./workmap";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ cleanup } = await useNewcomerDirs("ws6-cascade-"));
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

const exists = (p: string) => fsp.stat(p).then(() => true, () => false);

async function allText(dir: string): Promise<string> {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(json|md|ndjson)$/.test(e.name)) out.push(await fsp.readFile(p, "utf8"));
    }
  };
  await walk(dir);
  return out.join("\n");
}

// --- pure ------------------------------------------------------------------------

describe("computeCascade (pure)", () => {
  const graph: CascadeGraph = {
    sessions: [
      { session_id: "ses-x", role: "expert" },
      { session_id: "ses-n", role: "newcomer" },
    ],
    assets: [
      { asset_id: "a-1", session_id: "ses-x" },
      { asset_id: "a-2", session_id: "ses-x" },
    ],
    events: [
      { session_id: "ses-x", event_id: "evt-1", asset_id: "a-1" },
      { session_id: "ses-x", event_id: "evt-2", asset_id: "a-2" },
    ],
    exchanges: [
      { session_id: "ses-x", exchange_id: "x-1", event_id: "evt-1" },
      { session_id: "ses-x", exchange_id: "x-2", event_id: "evt-2" },
      { session_id: "ses-x", exchange_id: "x-tb", event_id: null },
    ],
    revisions: [
      { entry_id: "e-1", revision_id: "rev-1", session_id: "ses-x", event_ids: ["evt-1"], exchange_ids: ["x-1"], asset_ids: ["a-1"], revoked: false },
      { entry_id: "e-2", revision_id: "rev-2", session_id: "ses-x", event_ids: ["evt-2"], exchange_ids: ["x-2"], asset_ids: ["a-2"], revoked: false },
      { entry_id: "e-3", revision_id: "rev-3", session_id: "ses-x", event_ids: ["evt-1"], exchange_ids: [], asset_ids: [], revoked: true },
    ],
    confirmations: [{ reviewed_revision_id: "rev-2", expert_response_exchange_id: "x-tb" }],
    pins: [{ session_id: "ses-n", revision_ids: ["rev-1", "rev-2"] }],
    evaluations: [
      { session_id: "ses-n", evaluation_id: "evl-done", knowledge_revision_ids: ["rev-1", "rev-2"], cited_revision_ids: ["rev-1"], status: "done" },
      { session_id: "ses-n", evaluation_id: "evl-failed", knowledge_revision_ids: ["rev-1", "rev-2"], cited_revision_ids: [], status: "failed" },
    ],
  };

  it("event → its asset, exchanges about it → citing revisions → pinning sessions → evaluations", () => {
    const plan = computeCascade(graph, [{ kind: "event", id: "evt-1", session_id: "ses-x" }]);
    expect(plan.assets).toEqual(["a-1"]);
    expect(plan.events).toEqual([{ session_id: "ses-x", id: "evt-1" }]);
    expect(plan.exchanges).toEqual([{ session_id: "ses-x", id: "x-1" }]);
    expect(plan.revisions.map(r => r.revision_id)).toEqual(["rev-1"]); // rev-3 already revoked
    expect(plan.stale_evaluations).toEqual([{ session_id: "ses-n", id: "evl-done" }]);
    expect(plan.citing_evaluations).toEqual([{ session_id: "ses-n", id: "evl-done" }]);
    expect(plan.affected_sessions).toEqual(["ses-n", "ses-x"]);
  });

  it("asset → the event showing it → …", () => {
    const plan = computeCascade(graph, [{ kind: "asset", id: "a-2" }]);
    expect(plan.events.map(e => e.id)).toEqual(["evt-2"]);
    expect(plan.exchanges.map(e => e.id)).toEqual(["x-2"]);
    expect(plan.revisions.map(r => r.revision_id)).toEqual(["rev-2"]);
  });

  it("deleting the teach-back answer revokes the revision it confirmed", () => {
    const plan = computeCascade(graph, [{ kind: "exchange", id: "x-tb", session_id: "ses-x" }]);
    expect(plan.revisions.map(r => r.revision_id)).toEqual(["rev-2"]);
    expect(plan.assets).toEqual([]);
  });

  it("a trimmed exchange keeps its record but revokes its citers", () => {
    const plan = computeCascade(graph, [{ kind: "trimmed_exchange", id: "x-1", session_id: "ses-x" }]);
    expect(plan.exchanges).toEqual([]);
    expect(plan.trimmed_exchanges).toEqual([{ session_id: "ses-x", id: "x-1" }]);
    expect(plan.revisions.map(r => r.revision_id)).toEqual(["rev-1"]);
  });

  it("a session takes everything it owns; deleted sessions are never 'affected'", () => {
    const plan = computeCascade(graph, [{ kind: "session", id: "ses-x" }]);
    expect(plan.assets).toEqual(["a-1", "a-2"]);
    expect(plan.exchanges.map(x => x.id)).toEqual(["x-1", "x-2", "x-tb"]);
    expect(plan.revisions.map(r => r.revision_id)).toEqual(["rev-1", "rev-2"]);
    expect(plan.affected_sessions).toEqual(["ses-n"]);
  });

  it("a revision root only touches who depends on it; the same IDs in another session are not confused", () => {
    const plan = computeCascade(graph, [{ kind: "revision", id: "rev-2" }]);
    expect(plan.events).toEqual([]);
    expect(plan.revisions.map(r => r.revision_id)).toEqual(["rev-2"]);
    expect(computeCascade(graph, [{ kind: "event", id: "evt-1", session_id: "ses-other" }]).revisions).toEqual([]);
  });
});

// --- off the record ---------------------------------------------------------------

describe("off the record = not stored", () => {
  let sid: string;
  beforeEach(async () => {
    sid = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
  });

  it("an event captured inside an off-record segment is dropped even after the session is back on record", async () => {
    await seedAsset(sid, "a-1");
    const s1 = await setRecordState(sid, { state: "off_record" });
    const offAt = s1.session.recording_segments.at(-1)!.started_at_utc;
    await setRecordState(sid, { state: "on_record" });
    const r = await putEvent(sid, "evt-1", makeEvent(sid, "evt-1", "a-1", { captured_at_utc: offAt }));
    expect(r).toEqual({ status: 202, dropped: { status: "dropped_off_record", kind: "event", id: "evt-1" } });
    expect(await exists(sessionRecordFile(sid, "events", "evt-1"))).toBe(false);
    expect(await readTombstone("event", "evt-1", sid)).toMatchObject({ id: "evt-1", record_state: "off_record", dropped: true });
    // Retries stay idempotent: the same answer, nothing stored.
    expect((await putEvent(sid, "evt-1", makeEvent(sid, "evt-1", "a-1"))).status).toBe(202);
  });

  it("answer lines spoken inside an off-record segment are never stored", async () => {
    await seedAsset(sid, "a-1");
    await putEvent(sid, "evt-1", makeEvent(sid, "evt-1", "a-1"));
    const off = await setRecordState(sid, { state: "off_record" });
    const offAt = off.session.recording_segments.at(-1)!.started_at_utc;
    await setRecordState(sid, { state: "on_record" });
    const x = makeExchange(sid, "x-1", "evt-1", 1, 1);
    const r = await putExchange(sid, "x-1", { ...x, answer_lines: [...x.answer_lines, { text: "SECRET off-record line", at_utc: offAt, transcript_line_id: "l-secret" }] });
    expect(r.status).toBe(201);
    expect((await getExchange(sid, "x-1")).answer_lines.map(l => l.text)).toEqual(["FIXTURE answer line 1"]);
    expect(await allText(getConfig().knowledgeDir)).not.toContain("SECRET");
  });

  it("a retroactive off-record purge removes content, leaves tombstones, revokes and redacts what cited it", async () => {
    const { expertSid } = await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" });
    const s = await getSession(expertSid);
    // Pretend the session started before the fixture capture so `since_utc` can reach back to it.
    const open = s.recording_segments[0];
    await fsp.writeFile(
      path.join(sessionDir(expertSid), "session.json"),
      JSON.stringify({ ...s, recording_segments: [{ ...open, started_at_utc: "2026-10-03T09:00:00.000Z" }] }),
    );
    const before = await allText(getConfig().knowledgeDir);
    expect(before).toContain("I never save it when FIXTURE condition C is visible.");

    // "Everything since evt-002 was off the record."
    const { session, purge } = await setRecordState(expertSid, { state: "off_record", since_utc: "2026-10-03T10:00:20.000Z" });
    expect(session.record_state).toBe("off_record");
    expect(session.generation).toBeGreaterThan(0);
    expect(purge!.deleted.event_ids).toEqual(["evt-002"]);
    expect(purge!.deleted.asset_ids).toEqual(["a-2"]);
    expect(purge!.deleted.exchange_ids).toEqual(["x-2"]); // x-tb was asked before since_utc
    expect(purge!.revoked_revision_ids.length).toBeGreaterThan(0);

    expect(await exists(sessionRecordFile(expertSid, "events", "evt-002"))).toBe(false);
    expect(await exists(assetDir("a-2"))).toBe(false);
    expect(await readTombstone("event", "evt-002", expertSid)).toMatchObject({ dropped: true, record_state: "off_record", reason: "off_record_purge" });
    expect(await readTombstone("asset", "a-2", null)).toMatchObject({ dropped: true });
    const after = await allText(getConfig().knowledgeDir);
    expect(after).not.toContain("FIXTURE condition C");
    expect(after).not.toContain("FIXTURE cue B");
    for (const id of purge!.revoked_revision_ids) {
      const stored = await readRevision((await revisionsById())[id].entry_id, id);
      expect(await revisionStatus(stored!.revision)).toBe("revoked");
      expect(stored!.markdown).toContain(REDACTED_HEADING);
    }
    // A late retry of a purged record stays dropped.
    await setRecordState(expertSid, { state: "on_record" });
    expect((await putEvent(expertSid, "evt-002", makeEvent(expertSid, "evt-002", "a-2"))).status).toBe(202);
    expect((await readBusAfter(expertSid, 0)).map(e => e.type)).toEqual(expect.arrayContaining(["record_state.changed", "record.deleted", "entry.revoked"]));
  });

  it("since_utc must lie inside the current on-record segment", async () => {
    expect(await codeOf(setRecordState(sid, { state: "off_record", since_utc: "2020-01-01T00:00:00.000Z" }))).toBe("validation_failed");
  });
});

async function revisionsById() {
  return Object.fromEntries((await listAllRevisions()).map(r => [r.revision_id, r]));
}

// --- deletion ---------------------------------------------------------------------

describe("deletion cascade", () => {
  it("a delayed job after deletion recreates nothing (exchange deleted mid-synthesis)", async () => {
    const sid = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
    await seedAssetWithFiles(sid, "a-1");
    await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["FIXTURE words that must vanish."]));
    let release!: () => void;
    let called!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const started = new Promise<void>(r => (called = r));
    const provider: SynthesisProvider = {
      info: SYNTHESIS_PROVIDERS.stub.info,
      create(host) {
        const inner = SYNTHESIS_PROVIDERS.stub.create(host);
        return { ...inner, synthesize: async input => (called(), await gate, inner.synthesize(input)) };
      },
    };
    setSynthesisProviderForTests(provider);
    const job = await requestSynthesis(sid);
    await started;
    await deleteExchange(sid, "x-1");
    release();
    const done = await job.done;
    expect(done.status).toBe("discarded");
    expect(done.discard_reason).toMatch(/^(generation_changed|exchange_deleted)/);
    expect(await exists(path.join(getConfig().knowledgeDir, "entries"))).toBe(false);
    expect(await exists(sessionRecordFile(sid, "exchanges", "x-1"))).toBe(false);
    expect(await allText(getConfig().knowledgeDir)).not.toContain("must vanish");
  });

  it("a purge that only trims lines (same exchange rev) still discards a running job via the generation token", async () => {
    const sid = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
    const s = await getSession(sid);
    await fsp.writeFile(
      path.join(sessionDir(sid), "session.json"),
      JSON.stringify({ ...s, recording_segments: [{ ...s.recording_segments[0], started_at_utc: "2026-10-03T09:00:00.000Z" }] }),
    );
    await seedAssetWithFiles(sid, "a-1");
    await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1"));
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["kept line", "TRIMMED line"]));
    let release!: () => void;
    let called!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const started = new Promise<void>(r => (called = r));
    setSynthesisProviderForTests({
      info: SYNTHESIS_PROVIDERS.stub.info,
      create(host) {
        const inner = SYNTHESIS_PROVIDERS.stub.create(host);
        return { ...inner, synthesize: async input => (called(), await gate, inner.synthesize(input)) };
      },
    });
    const job = await requestSynthesis(sid);
    await started;
    // x-1's second line is at 10:00:11; evt-001 (10:00:05) and x-1 (asked 10:00:08) stay.
    const { purge } = await setRecordState(sid, { state: "off_record", since_utc: "2026-10-03T10:00:11.000Z" });
    expect(purge!.trimmed_exchange_ids).toEqual(["x-1"]);
    release();
    expect((await job.done).discard_reason).toMatch(/^generation_changed/);
    expect((await getExchange(sid, "x-1")).answer_lines.map(l => l.text)).toEqual(["kept line"]);
    expect(await allText(getConfig().knowledgeDir)).not.toContain("TRIMMED");
  });

  it("a late retry of a deleted ID → 410 gone (event, exchange, asset, session)", async () => {
    const sid = (await createSession({ role: "expert", source: "fixture", trace_ref: null, case_id: null })).session.session_id;
    await seedAsset(sid, "a-1");
    await seedAsset(sid, "a-9");
    const event = makeEvent(sid, "evt-001", "a-1");
    await putEvent(sid, "evt-001", event);
    const x = makeExchange(sid, "x-1", null, 1);
    await putExchange(sid, "x-1", x);

    const summary = await deleteEvent(sid, "evt-001");
    expect(summary.deleted).toMatchObject({ event_ids: ["evt-001"], asset_ids: ["a-1"] });
    expect(await codeOf(putEvent(sid, "evt-001", event))).toBe("gone");
    expect(await codeOf(getEvent(sid, "evt-001"))).toBe("not_found");
    expect(await codeOf(getAsset("a-1"))).toBe("not_found");
    expect(await deleteEvent(sid, "evt-001")).toMatchObject({ deleted: { event_ids: [] } }); // idempotent

    await deleteExchange(sid, "x-1");
    expect(await codeOf(putExchange(sid, "x-1", { ...x, rev: 2 }))).toBe("gone");

    await deleteAsset("a-9");
    expect(await exists(assetDir("a-9"))).toBe(false);

    await deleteSession(sid);
    expect(await exists(sessionDir(sid))).toBe(false);
    expect(await codeOf(getSession(sid))).toBe("gone");
    expect(await codeOf(putEvent(sid, "evt-002", makeEvent(sid, "evt-002", "a-9")))).toBe("gone");
    expect(await exists(busFile(sid))).toBe(false);
    expect(await deleteSession(sid)).toMatchObject({ deleted: { session_ids: [] } });
  });

  it("deleting a cited exchange revokes and redacts the revision; Work Map and pinning drop it; evaluations lose the quote", async () => {
    const { expertSid } = await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" });
    const newcomer = await newNewcomer();
    await putLearnerDraft(newcomer.session_id, { base_draft_rev: 0, decision: "FIXTURE_WRONG", reason: "r", visual_context: [] });
    const e = await (await requestEvaluation(newcomer.session_id, { draft_rev: 1 })).done;
    expect(e.cited[0].quote).toBeDefined();
    const citedExchange = e.cited[0].exchange_ids[0];

    const summary = await deleteExchange(expertSid, citedExchange);
    expect(summary.revoked_revision_ids).toContain(e.cited[0].revision_id);
    expect(summary.stale_evaluation_ids).toEqual([e.evaluation_id]);

    const after = (await loadEvaluation(newcomer.session_id, e.evaluation_id))!;
    expect(after).toMatchObject({ status: "stale", stale_reason: "knowledge_changed", feedback_text: null });
    expect(after.cited.every(c => c.quote === undefined)).toBe(true);
    const map = await getWorkMap();
    expect(map.steps.map(s => s.revision_id)).not.toContain(e.cited[0].revision_id);
    expect((await selectPinnedKnowledge(true)).pinned.map(p => p.revision_id)).not.toContain(e.cited[0].revision_id);
    expect((await readBusAfter(newcomer.session_id, 0)).map(x => x.type)).toContain("entry.revoked");
  });
});

// --- revocation -------------------------------------------------------------------

describe("revocation", () => {
  it("revocation → Work Map and pinning exclude it, and pending commits are blocked", async () => {
    await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" });
    const newcomer = await newNewcomer();
    const sid = newcomer.session_id;
    const pin: KnowledgeRef = newcomer.pinned_knowledge![0];
    await putLearnerDraft(sid, { base_draft_rev: 0, decision: "FIXTURE ok", reason: "r", visual_context: [] });
    const e = await (await requestEvaluation(sid, { draft_rev: 1 })).done;
    expect(e.status).toBe("done");

    const r = await revokeEntry(pin.entry_id, { reason: "expert withdrew it" });
    expect(r).toMatchObject({ revoked_revision_id: pin.revision_id, entry: { status: "revoked" } });
    expect(r.cascade.stale_evaluation_ids).toEqual([e.evaluation_id]);

    const err = await commitDraft(sid, { draft_rev: 1, evaluation_id: e.evaluation_id, escalated: false, idempotency_key: "k" }).catch(x => x);
    expect(err).toMatchObject({ code: "evaluation_stale", details: { policy_code: "knowledge_changed" } });
    expect((await getWorkMap()).steps.map(s => s.revision_id)).not.toContain(pin.revision_id);
    expect((await getWorkMap()).excluded).toContainEqual(expect.objectContaining({ revision_id: pin.revision_id, reason: "revoked" }));
    expect((await selectPinnedKnowledge(true)).pinned.map(p => p.revision_id)).not.toContain(pin.revision_id);
    // Revocation keeps the text (not a deletion), and a repeat is a no-op.
    expect((await readRevision(pin.entry_id, pin.revision_id))!.markdown).not.toContain(REDACTED_HEADING);
    expect((await revokeEntry(pin.entry_id, { reason: "again", revision_id: pin.revision_id })).entry.status).toBe("revoked");
  });
});

