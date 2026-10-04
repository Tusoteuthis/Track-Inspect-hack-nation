import { promises as fsp } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getHighlighted } from "@/app/api/assets/[aid]/highlighted/route";
import { GET as getOriginal } from "@/app/api/assets/[aid]/original/route";
import { parseWorkMapView } from "@/lib/contracts";
import { newExpertSession, useTempDirs } from "./capture-test-helpers";
import { getConfig } from "./config";
import { postConfirmation } from "./confirmations";
import { getExchange, putExchange } from "./exchanges";
import { withKnowledgeLock, writeWorkflow } from "./knowledge";
import { SYNTHESIS_PROVIDERS, setSynthesisProviderForTests } from "./modules";
import { assetDir, sessionRecordFile } from "./paths";
import { getSessionDraft, requestSynthesis } from "./synthesis";
import { expertExchange, seedCapture } from "./synthesis-test-helpers";
import { getWorkMap } from "./workmap";

let cleanup: () => Promise<void>;
let sid: string;

beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-workmap-"));
  sid = await newExpertSession();
  await seedCapture(sid);
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

async function synthAndConfirm(): Promise<string[]> {
  await (await requestSynthesis(sid)).done;
  const draft = await getSessionDraft(sid);
  await putExchange(sid, "x-tb", expertExchange(sid, "x-tb", null, ["Yes, that's right."], { phase: "teach_back" }));
  await postConfirmation({
    reviewed_revision_ids: draft.revision_ids,
    result: "confirmed",
    expert_response_exchange_id: "x-tb",
    idempotency_key: "tb",
  });
  return draft.revision_ids;
}

async function fetchUrl(url: string): Promise<number> {
  const m = /^\/api\/assets\/([^/]+)\/(original|highlighted)$/.exec(url);
  if (!m) return 0;
  const handler = m[2] === "original" ? getOriginal : getHighlighted;
  return (await handler(new Request(`http://test${url}`), { params: Promise.resolve({ aid: m[1] }) })).status;
}

describe.each([
  ["stub", SYNTHESIS_PROVIDERS.stub],
  ["real WS5", SYNTHESIS_PROVIDERS.real],
])("Work Map (%s synthesis)", (_name, provider) => {
  beforeEach(() => setSynthesisProviderForTests(provider));

  it("links every confirmed step to image URLs that return 200 and to verbatim exchange lines", async () => {
    const confirmed = await synthAndConfirm();
    const map = await getWorkMap();
    expect(parseWorkMapView(map).ok).toBe(true);
    expect(map.steps.length).toBeGreaterThan(0);
    expect(map.excluded).toEqual([]);
    for (const step of map.steps) {
      expect(step).toMatchObject({ status: "confirmed", is_current: true, source: expect.any(String), broken_links: [] });
      expect(confirmed).toContain(step.revision_id);
      expect(step.evidence.length).toBeGreaterThan(0);
      for (const e of step.evidence) {
        expect(await fetchUrl(e.original_url)).toBe(200);
        expect(await fetchUrl(e.highlighted_url!)).toBe(200);
        expect(e.region.coordinate_space).toBe("original_frame_normalized");
      }
      expect(step.exchanges.length).toBeGreaterThan(0);
      if (provider === SYNTHESIS_PROVIDERS.real) {
        // WS5 content: verbatim quotes with their question, AI synthesis tagged separately.
        expect(step.content?.expert_words.length).toBeGreaterThan(0);
        expect(step.content?.revision_id).toBe(step.revision_id);
      } else {
        expect(step.content).toBeNull();
      }
      for (const x of step.exchanges) {
        expect(x.answer_lines).toEqual((await getExchange(sid, x.exchange_id)).answer_lines);
      }
    }
  });

  it("shows drafts only with include=draft", async () => {
    await (await requestSynthesis(sid)).done;
    const def = await getWorkMap();
    expect(def.steps).toEqual([]);
    expect(def.excluded.length).toBeGreaterThan(0);
    expect(def.excluded[0].reason).toMatch(/^not_confirmed/);
    const all = await getWorkMap("draft");
    expect(all.steps.length).toBe(def.excluded.length);
    expect(all.steps.every(s => s.status === "draft")).toBe(true);
  });

  it("reports a missing asset image and a missing exchange as broken links instead of dropping the step", async () => {
    await synthAndConfirm();
    await fsp.rm(path.join(assetDir("a-1"), "original.png"));
    await fsp.rm(sessionRecordFile(sid, "exchanges", "x-2"));
    const map = await getWorkMap();
    const broken = map.steps.flatMap(s => s.broken_links);
    expect(broken).toContain("original image of asset a-1 missing");
    expect(broken).toContain("exchange x-2 not found");
    expect(map.steps.length + map.excluded.length).toBeGreaterThan(0);
    expect(map.steps.some(s => s.broken_links.length > 0)).toBe(true);
  });
});

describe("Work Map linkage", () => {
  it("is empty before any synthesis", async () => {
    expect(await getWorkMap()).toMatchObject({ steps: [], excluded: [], produced_by: null });
  });

  it("a workflow link to a revision that is not stored is returned with a broken link", async () => {
    await withKnowledgeLock(() =>
      writeWorkflow(
        {
          markdown: "1. **Gone** — [x](<entries/ent-gone/rev-1.md>)",
          produced_by: SYNTHESIS_PROVIDERS.stub.info,
          session_id: sid,
          job_id: "job-1",
        },
        new Date(),
      ),
    );
    const map = await getWorkMap();
    expect(map.steps).toEqual([
      expect.objectContaining({ entry_id: "ent-gone", revision_id: null, status: null, broken_links: ["revision ent-gone/rev-1 not stored"] }),
    ]);
  });

  it("a confirmed revision superseded by a new draft is no longer shown by default", async () => {
    setSynthesisProviderForTests(SYNTHESIS_PROVIDERS.stub);
    await synthAndConfirm();
    expect((await getWorkMap()).steps).toHaveLength(1);
    await putExchange(sid, "x-1", expertExchange(sid, "x-1", "evt-001", ["changed"], { rev: 2 }));
    await (await requestSynthesis(sid)).done;
    const map = await getWorkMap();
    expect(map.steps).toEqual([]);
    expect(map.excluded[0].reason).toMatch(/^not_confirmed: status is draft/);
    expect(path.isAbsolute(getConfig().knowledgeDir)).toBe(true);
  });
});
