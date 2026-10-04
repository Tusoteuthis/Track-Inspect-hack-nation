// Test-only helpers for newcomer, evaluation and commit tests.
import path from "node:path";
import type { Source } from "@/lib/contracts";
import { makeEvent, useTempDirs } from "./capture-test-helpers";
import { setConfigForTests } from "./config";
import { postConfirmation } from "./confirmations";
import { putEvent } from "./events";
import { putExchange } from "./exchanges";
import { SYNTHESIS_PROVIDERS, setSynthesisProviderForTests } from "./modules";
import { createNewcomerSession } from "./newcomer";
import { createSession } from "./sessions";
import { getSessionDraft, requestSynthesis } from "./synthesis";
import { expertExchange, seedAssetWithFiles } from "./synthesis-test-helpers";

export const FIXTURE_CASES_DIR = path.join(process.cwd(), "fixtures", "ws6", "cases");

/** Temp knowledge/runtime dirs plus the labelled fixture cases (read-only). */
export async function useNewcomerDirs(prefix: string) {
  const t = await useTempDirs(prefix);
  setConfigForTests({ casesDir: FIXTURE_CASES_DIR });
  return t;
}

/**
 * An expert session with two pointed moments, synthesized and confirmed via teach-back.
 * `source: "live"` produces knowledge WS5 eligibility accepts without the fixture flag.
 */
export async function seedConfirmedKnowledge(opts: { synthesis: "stub" | "real"; source?: Source } = { synthesis: "real" }) {
  const source = opts.source ?? "fixture";
  const sid = (await createSession({ role: "expert", source, trace_ref: null })).session.session_id;
  const ws3Source = source === "live" ? "live" : "fixture";
  await seedAssetWithFiles(sid, "a-1");
  await seedAssetWithFiles(sid, "a-2");
  await putEvent(sid, "evt-001", makeEvent(sid, "evt-001", "a-1", { source: ws3Source }));
  await putEvent(sid, "evt-002", makeEvent(sid, "evt-002", "a-2", { source: ws3Source, captured_at_utc: "2026-10-03T10:00:20.000Z", session_time_ms: 20000 }));
  await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["Here I read FIXTURE pattern A on the trace."], { source: ws3Source }));
  await putExchange(
    sid,
    "x-2",
    expertExchange(sid, "x-2", "evt-002", ["Because FIXTURE cue B is present.", "I never save it when FIXTURE condition C is visible."], {
      kind: "reasoning",
      asked_at_utc: "2026-10-03T10:00:25.000Z",
      source: ws3Source,
    }),
  );
  setSynthesisProviderForTests(opts.synthesis === "real" ? SYNTHESIS_PROVIDERS.real : SYNTHESIS_PROVIDERS.stub);
  const job = await (await requestSynthesis(sid)).done;
  if (job.status !== "done") throw new Error(`synthesis ${job.status}`);
  const draft = await getSessionDraft(sid);
  await putExchange(sid, "x-tb", expertExchange(sid, "x-tb", null, ["Yes, that's right."], { phase: "teach_back", source: ws3Source }));
  await postConfirmation({
    reviewed_revision_ids: draft.revision_ids,
    result: "confirmed",
    expert_response_exchange_id: "x-tb",
    idempotency_key: `tb-${sid}`,
  });
  return { expertSid: sid, revisionIds: draft.revision_ids };
}

export async function newNewcomer(opts: { caseId?: string | null; allowFixture?: boolean; key?: string } = {}) {
  const { session } = await createNewcomerSession(
    { role: "newcomer", source: "fixture", case_id: opts.caseId ?? null },
    { idempotencyKey: opts.key, allowFixtureKnowledge: opts.allowFixture ?? true },
  );
  return session;
}
