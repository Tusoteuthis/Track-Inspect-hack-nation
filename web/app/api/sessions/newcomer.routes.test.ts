import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createSessionRoute } from "@/app/api/sessions/route";
import { GET as getAssessmentRoute } from "@/app/api/sessions/[sid]/assessment/route";
import { GET as getCommitRoute, POST as commitRoute } from "@/app/api/sessions/[sid]/commit/route";
import { GET as getDraftRoute, PUT as putDraftRoute } from "@/app/api/sessions/[sid]/draft/route";
import { GET as getEvaluationRoute } from "@/app/api/sessions/[sid]/evaluations/[evaluation_id]/route";
import { GET as listEvaluationsRoute, POST as evaluateRoute } from "@/app/api/sessions/[sid]/evaluations/route";
import { POST as lifecycleRoute } from "@/app/api/sessions/[sid]/lifecycle/route";
import { POST as pinRoute } from "@/app/api/sessions/[sid]/pin/route";
import { parseApiErrorBody } from "@/lib/contracts";
import { loadEvaluation } from "@/lib/backend/learner-store";
import { seedConfirmedKnowledge, useNewcomerDirs } from "@/lib/backend/learner-test-helpers";
import { setSynthesisProviderForTests } from "@/lib/backend/modules";

let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ cleanup } = await useNewcomerDirs("ws6-newcomer-routes-"));
  await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" });
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

const json = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://test${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const sidCtx = (sid: string) => ({ params: Promise.resolve({ sid }) });

async function newcomer(query = "?allow_fixture_knowledge=1", body: unknown = { role: "newcomer" }) {
  const res = await createSessionRoute(json("POST", `/api/sessions${query}`, body));
  return { res, body: await res.json() };
}

/** Polls the evaluation until the in-process tutor finished. */
async function settled(sid: string, eid: string) {
  for (let i = 0; i < 100; i++) {
    const e = await loadEvaluation(sid, eid);
    if (e && e.status !== "pending") return e;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("evaluation did not finish");
}

describe("newcomer routes", () => {
  it("POST /api/sessions: fixture knowledge needs ?allow_fixture_knowledge=1; a shown case is refused", async () => {
    const strict = await newcomer("");
    expect(strict.res.status).toBe(409);
    expect(strict.body.error.code).toBe("no_confirmed_knowledge");
    const shown = await newcomer("?allow_fixture_knowledge=1", { role: "newcomer", case_id: "fx-e01" });
    expect(shown.res.status).toBe(409);
    expect(shown.body.error.code).toBe("case_not_permitted");
    const ok = await newcomer();
    expect(ok.res.status).toBe(201);
    expect(ok.body).toMatchObject({ role: "newcomer", case_id: "fx-n01", knowledge_fixture_allowed: true, trace_ref: "/api/cases/fx-n01/trace" });
    expect(ok.body.pinned_knowledge.length).toBeGreaterThan(0);
  });

  it("draft → evaluate → blocked commit → edit → evaluate → commit → assessment, over HTTP", async () => {
    const { body: session } = await newcomer();
    const sid: string = session.session_id;

    const d1 = await putDraftRoute(json("PUT", `/api/sessions/${sid}/draft`, { base_draft_rev: 0, decision: "FIXTURE_WRONG", reason: "r" }), sidCtx(sid));
    expect(d1.status).toBe(201);
    expect((await (await getDraftRoute(json("GET", `/api/sessions/${sid}/draft`), sidCtx(sid))).json()).draft_rev).toBe(1);

    const ev1 = await evaluateRoute(json("POST", `/api/sessions/${sid}/evaluations`, { draft_rev: 1 }), sidCtx(sid));
    expect(ev1.status).toBe(202);
    const e1 = await ev1.json();
    expect(e1.status).toBe("pending");
    expect((await settled(sid, e1.evaluation_id)).outcome).toBe("intervene");
    const got = await getEvaluationRoute(json("GET", "/x"), { params: Promise.resolve({ sid, evaluation_id: e1.evaluation_id }) });
    expect((await got.json()).feedback_text).toMatch(/STUB TUTOR/);

    const blocked = await commitRoute(json("POST", `/api/sessions/${sid}/commit`, { draft_rev: 1, evaluation_id: e1.evaluation_id, idempotency_key: "k1" }), sidCtx(sid));
    expect(blocked.status).toBe(409);
    const blockedBody = await blocked.json();
    expect(parseApiErrorBody(blockedBody).ok).toBe(true);
    expect(blockedBody.error).toMatchObject({ code: "blocked_by_outcome", details: { policy_code: "blocked_by_outcome", outcome: "intervene" } });

    const missingEval = await commitRoute(json("POST", `/api/sessions/${sid}/commit`, { draft_rev: 1, idempotency_key: "k0" }), sidCtx(sid));
    expect((await missingEval.json()).error.code).toBe("evaluation_required");

    await putDraftRoute(json("PUT", `/api/sessions/${sid}/draft`, { base_draft_rev: 1, decision: "FIXTURE better", reason: "r2" }), sidCtx(sid));
    const e2 = await (await evaluateRoute(json("POST", "/x", { draft_rev: 2 }), sidCtx(sid))).json();
    await settled(sid, e2.evaluation_id);
    const list = await (await listEvaluationsRoute(json("GET", "/x"), sidCtx(sid))).json();
    expect(list.evaluations.map((e: { status: string }) => e.status)).toEqual(["stale", "done"]);

    const c = await commitRoute(json("POST", "/x", { draft_rev: 2, evaluation_id: e2.evaluation_id, idempotency_key: "k2" }), sidCtx(sid));
    expect(c.status).toBe(201);
    const replay = await commitRoute(json("POST", "/x", { draft_rev: 2, evaluation_id: e2.evaluation_id, idempotency_key: "k2" }), sidCtx(sid));
    expect(replay.status).toBe(200);
    expect((await getCommitRoute(json("GET", "/x"), sidCtx(sid))).status).toBe(200);
    const a = await getAssessmentRoute(json("GET", "/x"), sidCtx(sid));
    expect(a.status).toBe(200);
    expect((await a.json()).content.interventions).toBe(1);
  });

  it("validation: malformed bodies → 400; pin on an expert session → 409", async () => {
    const { body: session } = await newcomer();
    const sid: string = session.session_id;
    expect((await putDraftRoute(json("PUT", "/x", { decision: "d" }), sidCtx(sid))).status).toBe(400);
    expect((await evaluateRoute(json("POST", "/x", { draft_rev: 0 }), sidCtx(sid))).status).toBe(400);
    expect((await commitRoute(json("POST", "/x", { draft_rev: 1 }), sidCtx(sid))).status).toBe(400);
    expect((await pinRoute(json("POST", "/x"), sidCtx(sid))).status).toBe(200);
    const expert = await createSessionRoute(json("POST", "/api/sessions", { role: "expert" }));
    const esid = (await expert.json()).session_id;
    expect((await pinRoute(json("POST", "/x"), sidCtx(esid))).status).toBe(409);
  });

  it("ending a newcomer session writes the assessment", async () => {
    const { body: session } = await newcomer();
    const sid: string = session.session_id;
    await putDraftRoute(json("PUT", "/x", { base_draft_rev: 0, decision: "d", reason: "r" }), sidCtx(sid));
    const started = await (await lifecycleRoute(json("POST", "/x", { action: "start", rev: 1 }), sidCtx(sid))).json();
    const ended = await lifecycleRoute(json("POST", "/x", { action: "end", rev: started.rev }), sidCtx(sid));
    expect(ended.status).toBe(200);
    expect((await getAssessmentRoute(json("GET", "/x"), sidCtx(sid))).status).toBe(200);
  });
});
