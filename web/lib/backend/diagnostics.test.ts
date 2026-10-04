import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as diagnosticsRoute } from "@/app/api/diagnostics/route";
import { getConfig } from "./config";
import { overviewDiagnostics, sessionDiagnostics } from "./diagnostics";
import { listExchanges } from "./exchanges";
import { commitDraft, putLearnerDraft, requestEvaluation } from "./learner";
import { newNewcomer, seedConfirmedKnowledge, useNewcomerDirs } from "./learner-test-helpers";
import { setSynthesisProviderForTests } from "./modules";

let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ cleanup } = await useNewcomerDirs("ws6-diagnostics-"));
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

async function fullFlow() {
  const { expertSid } = await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" });
  const n = await newNewcomer();
  await putLearnerDraft(n.session_id, { base_draft_rev: 0, decision: "FIXTURE_WRONG", reason: "FIXTURE learner reason text", visual_context: [] });
  await (await requestEvaluation(n.session_id, { draft_rev: 1 })).done;
  await putLearnerDraft(n.session_id, { base_draft_rev: 1, decision: "FIXTURE fixed decision", reason: "FIXTURE learner reason two", visual_context: [] });
  const ok = await (await requestEvaluation(n.session_id, { draft_rev: 2 })).done;
  const { commit } = await commitDraft(n.session_id, { draft_rev: 2, evaluation_id: ok.evaluation_id, escalated: false, idempotency_key: "k" });
  return { expertSid, newcomerSid: n.session_id, commitId: commit.commit_id };
}

describe("diagnostics", () => {
  it("traces event → exchanges → revisions → confirmation → newcomer session → evaluations → commit", async () => {
    const { expertSid, newcomerSid, commitId } = await fullFlow();
    const d = await sessionDiagnostics(expertSid);
    expect(d.role).toBe("expert");
    const chain = d.chain as Awaited<ReturnType<typeof sessionDiagnostics>>["chain"] & { events: { event_id: string; exchanges: unknown[]; revisions: { status: string }[]; confirmations: unknown[]; newcomer_sessions: { session_id: string; evaluations: { outcome: string | null }[]; commit: { commit_id: string } | null }[] }[] };
    const evt = chain.events.find(e => e.event_id === "evt-001")!;
    expect(evt.exchanges.length).toBeGreaterThan(0);
    expect(evt.revisions.some(r => r.status === "confirmed")).toBe(true);
    expect(evt.confirmations.length).toBeGreaterThan(0);
    const nc = evt.newcomer_sessions.find(s => s.session_id === newcomerSid)!;
    expect(nc.evaluations.map(e => e.outcome)).toEqual(["intervene", "ok"]);
    expect(nc.commit?.commit_id).toBe(commitId);

    const res = await diagnosticsRoute(new Request(`http://t/api/diagnostics?session_id=${newcomerSid}`));
    expect(res.status).toBe(200);
    expect((await res.json()).chain.commit.commit_id).toBe(commitId);
    expect((await overviewDiagnostics()).sessions.map(s => s.session_id)).toEqual(expect.arrayContaining([expertSid, newcomerSid]));
  });

  it("diag output and diagnostics contain no content (expert words, learner text, questions)", async () => {
    const { expertSid, newcomerSid } = await fullFlow();
    const words = [
      ...(await listExchanges(expertSid)).flatMap(x => [x.question, ...x.answer_lines.map(l => l.text)]),
      "FIXTURE learner reason text",
      "FIXTURE fixed decision",
    ].filter(w => w.length > 8);
    expect(words.length).toBeGreaterThan(3);
    const diagDir = path.join(getConfig().runtimeDir, "diag");
    const diagText = (await Promise.all((await fsp.readdir(diagDir)).map(f => fsp.readFile(path.join(diagDir, f), "utf8")))).join("\n");
    expect(diagText.length).toBeGreaterThan(0);
    const shown = JSON.stringify([await sessionDiagnostics(expertSid), await sessionDiagnostics(newcomerSid), await overviewDiagnostics()]);
    for (const w of words) {
      expect(diagText).not.toContain(w);
      expect(shown).not.toContain(w);
    }
    expect(diagText).not.toMatch(/FIXTURE/);
  });
});
