import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setSynthesisProviderForTests } from "./modules";
import { readBusAfter } from "./bus";
import type { KnowledgeRef } from "@/lib/contracts";
import { appendStatusTransition, readRevision } from "./knowledge";
import { FIXTURE_CASES_DIR, newNewcomer, seedConfirmedKnowledge, useNewcomerDirs } from "./learner-test-helpers";
import { createNewcomerSession, pinnedKnowledgeCurrent, selectPinnedKnowledge } from "./newcomer";
import { repinSession } from "./learner";
import { setConfigForTests } from "./config";

let cleanup: () => Promise<void>;

/** Sprint 4 adds the revoke route; here a status transition stands in for it. */
async function revoke(ref: KnowledgeRef) {
  const stored = await readRevision(ref.entry_id, ref.revision_id);
  await appendStatusTransition({ revision: stored!.revision, to: "revoked", confirmation_id: null }, new Date());
}

beforeEach(async () => {
  ({ cleanup } = await useNewcomerDirs("ws6-newcomer-"));
});
afterEach(async () => {
  setSynthesisProviderForTests(null);
  await cleanup();
});

describe("pinning", () => {
  it("no confirmed knowledge → 409 no_confirmed_knowledge", async () => {
    await expect(newNewcomer()).rejects.toMatchObject({ code: "no_confirmed_knowledge" });
  });

  it("pins WS5-eligible confirmed revisions (live knowledge, no fixture flag needed)", async () => {
    const { revisionIds } = await seedConfirmedKnowledge({ synthesis: "real", source: "live" });
    const session = await newNewcomer({ allowFixture: false });
    expect(session).toMatchObject({ role: "newcomer", case_id: "fx-n01", knowledge_fixture_allowed: false, lifecycle: "created" });
    expect(session.pinned_knowledge!.map(p => p.revision_id).sort()).toEqual([...revisionIds].sort());
  });

  it("fixture knowledge is never used silently: refused without the flag, pinned and marked with it", async () => {
    await seedConfirmedKnowledge({ synthesis: "real", source: "fixture" });
    const strict = await selectPinnedKnowledge(false);
    expect(strict.pinned).toEqual([]);
    expect(strict.excluded.every(x => x.reason.startsWith("fixture_not_allowed"))).toBe(true);
    await expect(newNewcomer({ allowFixture: false })).rejects.toMatchObject({ code: "no_confirmed_knowledge" });
    const s = await newNewcomer({ allowFixture: true });
    expect(s.knowledge_fixture_allowed).toBe(true);
    expect(s.pinned_knowledge!.length).toBeGreaterThan(0);
  });

  it("stub-synthesis knowledge counts as fixture material", async () => {
    await seedConfirmedKnowledge({ synthesis: "stub", source: "live" });
    expect((await selectPinnedKnowledge(false)).pinned).toEqual([]);
    expect((await selectPinnedKnowledge(true)).pinned.length).toBe(1);
  });

  it("a revoked revision is never pinned", async () => {
    await seedConfirmedKnowledge({ synthesis: "real", source: "live" });
    const [pin] = (await selectPinnedKnowledge(false)).pinned;
    await revoke(pin);
    const after = await selectPinnedKnowledge(false);
    expect(after.pinned.map(p => p.revision_id)).not.toContain(pin.revision_id);
    expect(after.excluded).toContainEqual(expect.objectContaining({ entry_id: pin.entry_id, reason: expect.stringMatching(/^revoked/) }));
  });

  it("refuses a case shown to the expert and an unknown case", async () => {
    await seedConfirmedKnowledge({ synthesis: "stub" });
    await expect(newNewcomer({ caseId: "fx-e01" })).rejects.toMatchObject({ code: "case_not_permitted" });
    await expect(newNewcomer({ caseId: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("no unseen case available → case_not_permitted", async () => {
    await seedConfirmedKnowledge({ synthesis: "stub" });
    setConfigForTests({ casesDir: `${FIXTURE_CASES_DIR}-missing` });
    await expect(newNewcomer()).rejects.toMatchObject({ code: "case_not_permitted" });
  });

  it("an Idempotency-Key replay returns the same session without re-pinning", async () => {
    await seedConfirmedKnowledge({ synthesis: "stub" });
    const req = { role: "newcomer" as const, source: "fixture" as const, case_id: null };
    const a = await createNewcomerSession(req, { idempotencyKey: "nc-1", allowFixtureKnowledge: true });
    const b = await createNewcomerSession(req, { idempotencyKey: "nc-1", allowFixtureKnowledge: true });
    expect(a.status).toBe(201);
    expect(b).toEqual({ status: 200, session: a.session });
  });
});

describe("pinned knowledge currency and re-pin", () => {
  it("revoking a pinned revision makes the pins not current; re-pin excludes it", async () => {
    await seedConfirmedKnowledge({ synthesis: "real", source: "live" });
    const s = await newNewcomer({ allowFixture: false });
    const pins = s.pinned_knowledge!;
    expect(await pinnedKnowledgeCurrent(pins)).toBe(true);
    await revoke(pins[0]);
    expect(await pinnedKnowledgeCurrent(pins)).toBe(false);

    const repinned = await repinSession(s.session_id);
    expect(repinned.rev).toBe(s.rev + 1);
    expect(repinned.pinned_knowledge!.map(p => p.revision_id)).not.toContain(pins[0].revision_id);
    expect((await readBusAfter(s.session_id, 0)).map(e => e.type)).toContain("session.updated");
  });
});
