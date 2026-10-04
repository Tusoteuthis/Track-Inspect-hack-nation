import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommitRequest, Evaluation, KnowledgeRef, Session } from "@/lib/contracts";
import type { Judge, JudgeVerdict } from "@/lib/knowledge";
import { getAssessment } from "./assessment";
import { readBusAfter } from "./bus";
import { errorOf, seedAsset } from "./capture-test-helpers";
import { getExchange, putExchange } from "./exchanges";
import { appendStatusTransition, readRevision } from "./knowledge";
import {
  commitDraft,
  getLearnerDraft,
  onNewcomerEnded,
  putLearnerDraft,
  repinSession,
  requestEvaluation,
} from "./learner";
import { commitFile, listEvaluations, loadEvaluation } from "./learner-store";
import { newNewcomer, seedConfirmedKnowledge, useNewcomerDirs } from "./learner-test-helpers";
import {
  createWs5TutorProvider,
  setSynthesisProviderForTests,
  setTutorProviderForTests,
  TUTOR_PROVIDERS,
  type TutorProvider,
} from "./modules";
import { assessmentsDir } from "./paths";
import { changeLifecycle, changeRecordState } from "./sessions";
import { requestSynthesis } from "./synthesis";

let cleanup: () => Promise<void>;
let session: Session;
let expertSid: string;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useNewcomerDirs("ws6-learner-"));
  ({ expertSid } = await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" }));
  session = await newNewcomer({ allowFixture: true });
  sid = session.session_id;
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  setTutorProviderForTests(null);
  await cleanup();
});

const draftReq = (base: number, decision = "FIXTURE decision", reason = "FIXTURE reason") => ({
  base_draft_rev: base,
  decision,
  reason,
  visual_context: [],
});
const commitReq = (over: Partial<CommitRequest> = {}): CommitRequest => ({
  draft_rev: 1,
  evaluation_id: null,
  escalated: false,
  idempotency_key: "save-1",
  ...over,
});
const evaluate = async (draftRev: number) => (await requestEvaluation(sid, { draft_rev: draftRev })).done;
const busTypes = async () => (await readBusAfter(sid, 0)).map(e => e.type);
const pins = () => session.pinned_knowledge as KnowledgeRef[];
const policyOf = (err: unknown) => (err as { details?: { policy_code?: string } }).details?.policy_code;

/** A tutor whose evaluation finishes only when `release()` is called. */
function gatedTutor(outcome = "ok") {
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  const provider: TutorProvider = {
    info: { id: "gated-tutor", version: "0", source: "stub" },
    create: () => ({
      id: "gated-tutor",
      version: "0",
      async evaluate() {
        await gate;
        return { outcome, cited: [], feedback_text: "gated" };
      },
    }),
  };
  return { provider, release: () => release() };
}

async function revoke(ref: KnowledgeRef) {
  const stored = await readRevision(ref.entry_id, ref.revision_id);
  await appendStatusTransition({ revision: stored!.revision, to: "revoked", confirmation_id: null, reason: "test" }, new Date());
}

describe("learner draft", () => {
  it("assigns draft_rev = base + 1; a retry is a no-op; a stale base is refused", async () => {
    const a = await putLearnerDraft(sid, draftReq(0));
    expect(a).toMatchObject({ status: 201, draft: { draft_rev: 1, decision: "FIXTURE decision", session_id: sid, source: "fixture" } });
    expect(await putLearnerDraft(sid, draftReq(0))).toEqual({ status: 200, draft: a.draft });
    const stale = await errorOf(putLearnerDraft(sid, draftReq(0, "other")));
    expect(stale).toMatchObject({ code: "stale_revision", details: { current_draft_rev: 1 } });
    expect((await putLearnerDraft(sid, draftReq(1, "other"))).draft.draft_rev).toBe(2);
    expect((await getLearnerDraft(sid)).draft_rev).toBe(2);
    expect(await busTypes()).toEqual(expect.arrayContaining(["draft.updated"]));
  });

  it("visual context must reference an asset stored for this session", async () => {
    const region = null;
    const err = await errorOf(putLearnerDraft(sid, { ...draftReq(0), visual_context: [{ asset_id: "frame-1", region }] }));
    expect(err.code).toBe("asset_not_available");
    await seedAsset(sid, "frame-1");
    expect((await putLearnerDraft(sid, { ...draftReq(0), visual_context: [{ asset_id: "frame-1", region }] })).status).toBe(201);
    await seedAsset(expertSid, "frame-x");
    expect((await errorOf(putLearnerDraft(sid, { ...draftReq(1), visual_context: [{ asset_id: "frame-x", region }] }))).code).toBe(
      "asset_not_available",
    );
  });

  it("is refused for expert sessions, ended sessions and off the record", async () => {
    expect((await errorOf(putLearnerDraft(expertSid, draftReq(0)))).code).toBe("invalid_transition");
    await changeRecordState(sid, { state: "off_record" });
    expect((await errorOf(putLearnerDraft(sid, draftReq(0)))).code).toBe("off_record");
    await changeRecordState(sid, { state: "on_record" });
    const s1 = await changeLifecycle(sid, { action: "start", rev: 3 });
    await changeLifecycle(sid, { action: "end", rev: s1.rev });
    expect((await errorOf(putLearnerDraft(sid, draftReq(0)))).code).toBe("invalid_transition");
  });
});

describe("evaluation", () => {
  it("binds to the exact draft and pinned knowledge; one per draft_rev", async () => {
    await putLearnerDraft(sid, draftReq(0));
    expect((await errorOf(requestEvaluation(sid, { draft_rev: 2 }))).code).toBe("stale_revision");
    const first = await requestEvaluation(sid, { draft_rev: 1 });
    expect(first.status).toBe(202);
    expect(first.evaluation).toMatchObject({
      status: "pending",
      draft_rev: 1,
      knowledge_revision_ids: pins().map(p => p.revision_id),
      produced_by: { module: "ws6-stub-tutor", source: "stub" },
    });
    const again = await requestEvaluation(sid, { draft_rev: 1 });
    expect(again.status).toBe(200);
    expect(again.evaluation.evaluation_id).toBe(first.evaluation.evaluation_id);
    const done = await first.done;
    expect(done).toMatchObject({ status: "done", outcome: "ok" });
    expect(done.feedback_text).toMatch(/^STUB TUTOR/);
    expect((await requestEvaluation(sid, { draft_rev: 1 })).evaluation.evaluation_id).toBe(first.evaluation.evaluation_id);
    expect(await listEvaluations(sid)).toHaveLength(1);
    expect((await busTypes()).filter(t => t === "evaluation.updated")).toHaveLength(2); // pending, done
  });

  it("a module failure → failed (no content), and a retry starts a new evaluation", async () => {
    await putLearnerDraft(sid, draftReq(0, "FIXTURE_FAIL"));
    const failed = await evaluate(1);
    expect(failed).toMatchObject({ status: "failed", error_code: "module_error", outcome: null, feedback_text: null });
    const retry = await requestEvaluation(sid, { draft_rev: 1 });
    expect(retry.status).toBe(202);
    expect(retry.evaluation.evaluation_id).not.toBe(failed.evaluation_id);
    expect((await retry.done).status).toBe("failed");
  });

  it("an edit while the evaluation runs → the result is stored as stale, never done", async () => {
    const gated = gatedTutor("ok");
    setTutorProviderForTests(gated.provider);
    await putLearnerDraft(sid, draftReq(0));
    const run = await requestEvaluation(sid, { draft_rev: 1 });
    await putLearnerDraft(sid, draftReq(1, "edited"));
    gated.release();
    const result = await run.done;
    expect(result).toMatchObject({ status: "stale", stale_reason: "draft_changed", outcome: "ok" });
    expect((await loadEvaluation(sid, result.evaluation_id))!.status).toBe("stale");
  });

  it("knowledge revoked while the evaluation runs → stale (knowledge_changed)", async () => {
    const gated = gatedTutor("ok");
    setTutorProviderForTests(gated.provider);
    await putLearnerDraft(sid, draftReq(0));
    const run = await requestEvaluation(sid, { draft_rev: 1 });
    await revoke(pins()[0]);
    gated.release();
    expect(await run.done).toMatchObject({ status: "stale", stale_reason: "knowledge_changed" });
    expect(policyOf(await errorOf(requestEvaluation(sid, { draft_rev: 1 })))).toBe("knowledge_changed");
  });

  it("an edit after evaluation marks it stale (status + SSE)", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    await putLearnerDraft(sid, draftReq(1, "edited"));
    expect(await loadEvaluation(sid, e.evaluation_id)).toMatchObject({ status: "stale", stale_reason: "draft_changed" });
    const updates = (await readBusAfter(sid, 0)).filter(x => x.type === "evaluation.updated");
    expect(updates.map(x => x.ids.evaluation_id)).toEqual([e.evaluation_id, e.evaluation_id, e.evaluation_id]); // pending, done, stale
  });

  it("the real WS5 evaluator runs through the adapter (scripted judge) and cites pinned knowledge verbatim", async () => {
    const judge: Judge = {
      name: "scripted",
      async judge(input): Promise<JudgeVerdict> {
        const item = input.knowledge.find(k => k.expert_quotes.some(q => q.split(" ").length >= 3))!;
        const quote = item.expert_quotes.find(q => q.split(" ").length >= 3)!;
        return {
          outcome: "intervene",
          citations: [{ entry_id: item.entry_id, quote }],
          guiding_question: "What do you notice on the trace?",
          explanation: "The draft does not follow the expert's condition.",
          uncertainty: null,
          escalation_entry_id: null,
          missing_context: null,
        };
      },
    };
    setTutorProviderForTests(createWs5TutorProvider(judge));
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    expect(e).toMatchObject({ status: "done", outcome: "intervene", produced_by: { module: "ws5-tutor", source: "live" } });
    expect(e.cited.length).toBeGreaterThan(0);
    for (const c of e.cited) {
      expect(pins().map(p => p.revision_id)).toContain(c.revision_id);
      const words = await Promise.all(c.exchange_ids.map(async x => (await getExchange(expertSid, x)).answer_lines.map(l => l.text).join(" ")));
      expect(words.join(" ")).toContain(c.quote!);
    }
  });

  it("the real WS5 evaluator without a working judge → failed, never uncertain", async () => {
    const broken: Judge = { name: "broken", judge: async () => Promise.reject(new Error("no key")) };
    setTutorProviderForTests(createWs5TutorProvider(broken));
    await putLearnerDraft(sid, draftReq(0));
    expect(await evaluate(1)).toMatchObject({ status: "failed", error_code: "module_error", outcome: null });
  });
});

describe("commit guard", () => {
  it("rejects without an evaluation", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const err = await errorOf(commitDraft(sid, commitReq()));
    expect(err).toMatchObject({ code: "evaluation_required", status: 409, details: { policy_code: "evaluation_required" } });
    expect((await errorOf(commitDraft(sid, commitReq({ evaluation_id: "evl-unknown" })))).code).toBe("evaluation_required");
  });

  it("rejects while the evaluation is pending", async () => {
    const gated = gatedTutor("ok");
    setTutorProviderForTests(gated.provider);
    await putLearnerDraft(sid, draftReq(0));
    const run = await requestEvaluation(sid, { draft_rev: 1 });
    expect((await errorOf(commitDraft(sid, commitReq({ evaluation_id: run.evaluation.evaluation_id })))).code).toBe("evaluation_pending");
    gated.release();
    await run.done;
    expect((await commitDraft(sid, commitReq({ evaluation_id: run.evaluation.evaluation_id }))).status).toBe(201);
  });

  it("rejects after an edit (stale) and for an older draft_rev", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e1 = await evaluate(1);
    await putLearnerDraft(sid, draftReq(1, "edited"));
    expect(policyOf(await errorOf(commitDraft(sid, commitReq({ draft_rev: 1, evaluation_id: e1.evaluation_id }))))).toBe("evaluation_stale");
    expect((await errorOf(commitDraft(sid, commitReq({ draft_rev: 2, evaluation_id: e1.evaluation_id })))).code).toBe("evaluation_stale");
    const e2 = await evaluate(2);
    expect((await errorOf(commitDraft(sid, commitReq({ draft_rev: 1, evaluation_id: e2.evaluation_id })))).code).toBe("evaluation_stale");
    expect((await commitDraft(sid, commitReq({ draft_rev: 2, evaluation_id: e2.evaluation_id }))).status).toBe(201);
  });

  it("rejects outcome intervene (blocked_by_outcome)", async () => {
    await putLearnerDraft(sid, draftReq(0, "FIXTURE_WRONG"));
    const e = await evaluate(1);
    expect(e.outcome).toBe("intervene");
    const err = await errorOf(commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id })));
    expect(err).toMatchObject({ code: "commit_blocked", details: { policy_code: "blocked_by_outcome", outcome: "intervene", consequence: "block" } });
  });

  it("uncertain needs an explicit escalation; the commit records it", async () => {
    await putLearnerDraft(sid, draftReq(0, "FIXTURE_UNCERTAIN"));
    const e = await evaluate(1);
    expect((await errorOf(commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id })))).details).toMatchObject({ requires: "escalated" });
    const { commit } = await commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id, escalated: true }));
    expect(commit).toMatchObject({ escalated: true, outcome: "uncertain" });
  });

  it("rejects when pinned knowledge is revoked after evaluation", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    await revoke(pins()[0]);
    expect(await errorOf(commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id })))).toMatchObject({
      code: "evaluation_stale",
      details: { policy_code: "knowledge_changed" },
    });
  });

  it("rejects when pinned knowledge is revised after evaluation; re-pin + re-evaluate recovers", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    // The expert corrects an answer → synthesis writes a new current revision of that entry.
    const x1 = await getExchange(expertSid, "x-1");
    await putExchange(expertSid, "x-1", {
      ...x1,
      rev: x1.rev + 1,
      answer_lines: [...x1.answer_lines, { text: "FIXTURE correction: only with cue D.", at_utc: "2026-10-03T10:00:30.000Z", transcript_line_id: "x-1-l9" }],
    });
    expect((await (await requestSynthesis(expertSid)).done).status).toBe("done");
    expect(await errorOf(commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id })))).toMatchObject({
      code: "evaluation_stale",
      details: { policy_code: "knowledge_changed" },
    });

    // The new revision is a draft, so only the untouched confirmed revisions stay pinned.
    const repinned = await repinSession(sid);
    expect(repinned.pinned_knowledge!.length).toBeLessThan(pins().length);
    expect(await loadEvaluation(sid, e.evaluation_id)).toMatchObject({ status: "stale", stale_reason: "knowledge_changed" });
    const e2 = await evaluate(1);
    expect((await commitDraft(sid, commitReq({ evaluation_id: e2.evaluation_id }))).status).toBe(201);
  });

  it("a second commit: same key → the same commit (200); different key → already_committed", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    const a = await commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id }));
    expect(a.status).toBe(201);
    expect(await commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id }))).toEqual({ status: 200, commit: a.commit });
    const err = await errorOf(commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id, idempotency_key: "save-2" })));
    expect(err).toMatchObject({ code: "commit_blocked", details: { policy_code: "already_committed" } });
    expect((await errorOf(putLearnerDraft(sid, draftReq(1, "after commit")))).code).toBe("invalid_transition");
    expect((await errorOf(requestEvaluation(sid, { draft_rev: 1 }))).code).toBe("invalid_transition");
  });

  it("two concurrent commits with different keys → exactly one commit", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    const results = await Promise.allSettled([
      commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id, idempotency_key: "click-a" })),
      commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id, idempotency_key: "click-b" })),
    ]);
    const ok = results.filter(r => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected.map(r => policyOf(r.reason))).toEqual(["already_committed"]);
    expect((await readBusAfter(sid, 0)).filter(x => x.type === "commit.stored")).toHaveLength(1);
  });

  it("two concurrent commits with the same key (double submit) → one commit, both see it", async () => {
    await putLearnerDraft(sid, draftReq(0));
    const e = await evaluate(1);
    const [a, b] = await Promise.all([
      commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id })),
      commitDraft(sid, commitReq({ evaluation_id: e.evaluation_id })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.commit.commit_id).toBe(b.commit.commit_id);
    const stored = JSON.parse(await fsp.readFile(commitFile(sid), "utf8"));
    expect(stored.commit_id).toBe(a.commit.commit_id);
    expect(JSON.stringify(stored)).not.toContain("save-1");
  });
});

describe("happy path and assessment", () => {
  it("wrong draft → intervene (citing the expert's words) → blocked → edit → re-evaluate → ok → commit once → assessment", async () => {
    await putLearnerDraft(sid, draftReq(0, "FIXTURE_WRONG", "FIXTURE wrong reason"));
    const wrong: Evaluation = await evaluate(1);
    expect(wrong.outcome).toBe("intervene");
    expect(wrong.cited.length).toBe(1);
    const [c] = wrong.cited;
    expect(pins().map(p => p.revision_id)).toContain(c.revision_id);
    const exchangeText = (await getExchange(expertSid, c.exchange_ids[0])).answer_lines.map(l => l.text);
    expect(exchangeText).toContain(c.quote);
    expect(wrong.feedback_text).toContain(c.quote);

    expect(policyOf(await errorOf(commitDraft(sid, commitReq({ evaluation_id: wrong.evaluation_id }))))).toBe("blocked_by_outcome");
    await new Promise(r => setTimeout(r, 5)); // distinct timestamps for the timeline order
    await putLearnerDraft(sid, draftReq(1, "FIXTURE corrected decision", "FIXTURE better reason"));
    const ok = await evaluate(2);
    expect(ok.outcome).toBe("ok");
    const { status, commit } = await commitDraft(sid, commitReq({ draft_rev: 2, evaluation_id: ok.evaluation_id }));
    expect(status).toBe(201);
    expect(commit).toMatchObject({ draft_rev: 2, evaluation_id: ok.evaluation_id, outcome: "ok", escalated: false });

    const a = await getAssessment(sid);
    expect(a).toMatchObject({
      session_id: sid,
      initial_decision: "FIXTURE_WRONG",
      final_outcome: "ok",
      practice_next: null,
      produced_by: { module: "ws6-stub-assessment", source: "stub" },
      content: { interventions: 1, committed: true, commit_id: commit.commit_id },
    });
    expect(a.assistance).toEqual([`intervene on draft_rev 1 (${wrong.evaluation_id})`]);
    expect(a.evidence_used).toEqual([{ entry_id: c.entry_id, revision_id: c.revision_id }]);
    const timeline = (a.content as { timeline: { kind: string; intervention?: string }[] }).timeline;
    expect(timeline.map(t => t.kind)).toEqual(["proposed", "evaluated", "guidance_delivered", "revised", "evaluated", "committed"]);
    expect(timeline.find(t => t.intervention)?.intervention).toBe("caught_before_save");
    const md = await fsp.readFile(path.join(assessmentsDir(), `${sid}.md`), "utf8");
    expect(md).toMatch(/STUB ASSESSMENT/);

    expect(await busTypes()).toEqual(expect.arrayContaining(["commit.stored", "assessment.stored"]));
  });

  it("ending a newcomer session without a commit still writes the assessment", async () => {
    await putLearnerDraft(sid, draftReq(0, "FIXTURE_WRONG"));
    await evaluate(1);
    await onNewcomerEnded(sid);
    expect(await getAssessment(sid)).toMatchObject({ initial_decision: "FIXTURE_WRONG", final_outcome: null, content: { committed: false } });
  });
});

describe("stub tutor provider", () => {
  it("is the default and is labelled stub", () => {
    expect(TUTOR_PROVIDERS.stub.info).toEqual({ id: "ws6-stub-tutor", version: "0.1.0", source: "stub" });
  });
});
