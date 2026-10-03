import { describe, expect, it } from "vitest";
import { fixtureEntry, loadWs5Fixtures } from "@/fixtures/ws5/load";
import {
  ELIGIBILITY_ORDER,
  isTeachable,
  selectEligible,
  type EligibilityContext,
  type KnowledgeCandidate,
} from "./eligibility";
import type { KnowledgeEntryContent } from "./schema";

const fx = loadWs5Fixtures();
const ctx = (overrides: Partial<EligibilityContext> = {}): EligibilityContext => ({
  current_revision_by_entry: fx.current_revision_by_entry,
  exchanges: fx.exchanges,
  events: fx.events,
  allow_fixture: true,
  ...overrides,
});

const candidate = (entry: KnowledgeEntryContent, path: string | null = null, record_type = "knowledge_entry"): KnowledgeCandidate => ({
  record_type,
  path: path ?? `knowledge/entries/${entry.entry_id}/${entry.revision_id}.md`,
  entry,
});
const reasonFor = (c: KnowledgeCandidate, context = ctx()) => {
  const r = isTeachable(c, context);
  return r.ok ? "ok" : r.reason;
};

describe("isTeachable", () => {
  it("accepts a confirmed, current, on-record, valid revision", () => {
    expect(isTeachable(candidate(fixtureEntry("ent-step-a")), ctx())).toEqual({ ok: true });
  });

  it.each([
    ["not_confirmed (draft)", "ent-draft-start", "rev-1", "not_confirmed"],
    ["not_confirmed (unresolved)", "ent-unresolved-b", "rev-1", "not_confirmed"],
    ["revoked", "ent-revoked-a", "rev-1", "revoked"],
    ["superseded", "ent-decision-a", "rev-1", "superseded"],
    ["off_record_evidence", "ent-offrecord-e", "rev-1", "off_record_evidence"],
    ["invalid", "ent-invalid-quote", "rev-1", "invalid"],
  ])("%s", (_name, id, rev, reason) => {
    expect(reasonFor(candidate(fixtureEntry(id, rev)))).toBe(reason);
  });

  it("fixture_not_allowed unless ctx.allow_fixture", () => {
    expect(reasonFor(candidate(fixtureEntry("ent-step-a")), ctx({ allow_fixture: false }))).toBe("fixture_not_allowed");
  });

  it("fixture_not_allowed also catches a live entry built on fixture evidence", () => {
    const live = { ...structuredClone(fixtureEntry("ent-step-a")), source: "live" as const };
    expect(reasonFor(candidate(live), ctx({ allow_fixture: false }))).toBe("fixture_not_allowed");
  });

  it.each([
    ["an assessment record", "knowledge/assessments/fixture-session-001.md", "knowledge_entry"],
    ["an evaluator note", "web/.runtime/evaluator/case-1.md", "knowledge_entry"],
    ["learner material", "knowledge/learner/ses-1/entries/ent-step-a/rev-1.md", "knowledge_entry"],
    ["a session transcript", "knowledge/sessions/fixture-session-001/exchanges.md", "knowledge_entry"],
    ["a path that does not match the entry id", "knowledge/entries/ent-other/rev-1.md", "knowledge_entry"],
    ["a non-entry record type", "knowledge/entries/ent-step-a/rev-1.md", "assessment"],
  ])("not_knowledge for %s", (_name, path, recordType) => {
    expect(reasonFor(candidate(fixtureEntry("ent-step-a"), path, recordType))).toBe("not_knowledge");
  });

  it("superseded when an entry has no current revision at all", () => {
    expect(reasonFor(candidate(fixtureEntry("ent-step-a")), ctx({ current_revision_by_entry: {} }))).toBe("superseded");
  });

  it("fails closed as invalid when linked evidence is unknown", () => {
    expect(reasonFor(candidate(fixtureEntry("ent-step-a")), ctx({ events: [] }))).toBe("invalid");
    expect(reasonFor(candidate(fixtureEntry("ent-step-a")), ctx({ exchanges: [] }))).toBe("invalid");
  });

  it("treats words about an off-record gesture as off-record", () => {
    const exchanges = fx.exchanges.map(x => (x.exchange_id === "exc-001" ? { ...x, event_id: "evt-005" } : x));
    expect(reasonFor(candidate(fixtureEntry("ent-step-a")), ctx({ exchanges }))).toBe("off_record_evidence");
  });

  it("checks an off-record confirmation response too", () => {
    const exchanges = fx.exchanges.map(x => (x.exchange_id === "exc-005" ? { ...x, record_state: "off_record" as const } : x));
    expect(reasonFor(candidate(fixtureEntry("ent-step-a")), ctx({ exchanges }))).toBe("off_record_evidence");
  });

  it("returns the first failing reason in the documented order", () => {
    expect(ELIGIBILITY_ORDER).toEqual([
      "not_knowledge",
      "invalid",
      "revoked",
      "not_confirmed",
      "superseded",
      "off_record_evidence",
      "fixture_not_allowed",
    ]);
    // Both superseded and fixture: superseded wins.
    expect(reasonFor(candidate(fixtureEntry("ent-decision-a", "rev-1")), ctx({ allow_fixture: false }))).toBe("superseded");
  });
});

describe("selectEligible on the fixture set", () => {
  it("pins exactly the confirmed, current, on-record, valid revisions (with allow_fixture)", () => {
    const { pinned, excluded } = selectEligible(fx.candidates, ctx());
    expect(pinned.map(e => `${e.entry_id}@${e.revision_id}`)).toEqual([
      "ent-step-a@rev-1",
      "ent-decision-a@rev-2",
      "ent-guardrail-c@rev-1",
      "ent-escalate-unclear@rev-1",
    ]);
    expect(Object.fromEntries(excluded.map(x => [`${x.entry_id}@${x.revision_id}`, x.reason]))).toEqual({
      "ent-decision-a@rev-1": "superseded",
      "ent-draft-start@rev-1": "not_confirmed",
      "ent-invalid-quote@rev-1": "invalid",
      "ent-offrecord-e@rev-1": "off_record_evidence",
      "ent-revoked-a@rev-1": "revoked",
      "ent-unresolved-b@rev-1": "not_confirmed",
    });
  });

  it("pins nothing from fixtures without allow_fixture", () => {
    const { pinned, excluded } = selectEligible(fx.candidates, ctx({ allow_fixture: false }));
    expect(pinned).toEqual([]);
    expect(excluded).toHaveLength(fx.candidates.length);
  });

  it("returns frozen copies, so later edits to stored records cannot leak in", () => {
    const source = structuredClone(fixtureEntry("ent-step-a"));
    const { pinned } = selectEligible([candidate(source)], ctx());
    source.status = "revoked";
    expect(pinned[0].status).toBe("confirmed");
    expect(Object.isFrozen(pinned[0])).toBe(true);
    expect(Object.isFrozen(pinned[0].expert_words[0])).toBe(true);
  });

  it("reflects a revocation as soon as it is re-run", () => {
    const revoked = {
      ...structuredClone(fixtureEntry("ent-guardrail-c")),
      status: "revoked" as const,
      revoked_at_utc: "2026-10-03T11:00:00.000Z",
      revoked_reason: "FIXTURE: removed by the expert",
    };
    const { pinned } = selectEligible([candidate(revoked)], ctx());
    expect(pinned).toEqual([]);
  });
});
