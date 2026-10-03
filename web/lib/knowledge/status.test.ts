import { describe, expect, it } from "vitest";
import type { EntryStatus } from "./schema";
import { nextStatus, type StatusAction, type StatusTransition } from "./status";

const confirmation = (result: "confirmed" | "corrected" | "unresolved"): StatusAction => ({ type: "confirmation", result });
const revoke: StatusAction = { type: "revoke" };
const ok = (status: EntryStatus, new_revision_required = false): StatusTransition => ({ ok: true, status, new_revision_required });
const invalid = expect.objectContaining({ ok: false, error: "invalid_transition" });

// Every status × action pair. A correction never changes the reviewed revision's content:
// it requires a new revision, and a corrected confirmed revision stops teaching.
const TABLE: [EntryStatus, StatusAction, unknown][] = [
  ["draft", confirmation("confirmed"), ok("confirmed")],
  ["draft", confirmation("corrected"), ok("draft", true)],
  ["draft", confirmation("unresolved"), ok("unresolved")],
  ["draft", revoke, ok("revoked")],
  ["unresolved", confirmation("confirmed"), ok("confirmed")],
  ["unresolved", confirmation("corrected"), ok("unresolved", true)],
  ["unresolved", confirmation("unresolved"), ok("unresolved")],
  ["unresolved", revoke, ok("revoked")],
  ["confirmed", confirmation("confirmed"), ok("confirmed")],
  ["confirmed", confirmation("corrected"), ok("unresolved", true)],
  ["confirmed", confirmation("unresolved"), ok("unresolved")],
  ["confirmed", revoke, ok("revoked")],
  ["revoked", confirmation("confirmed"), invalid],
  ["revoked", confirmation("corrected"), invalid],
  ["revoked", confirmation("unresolved"), invalid],
  ["revoked", revoke, invalid],
];

describe("nextStatus", () => {
  it("covers every status × action pair exactly once", () => {
    const statuses: EntryStatus[] = ["draft", "confirmed", "unresolved", "revoked"];
    const actions = ["confirmed", "corrected", "unresolved", "revoke"];
    const keys = TABLE.map(([s, a]) => `${s}:${a.type === "revoke" ? "revoke" : a.result}`);
    expect(new Set(keys).size).toBe(16);
    expect(keys.sort()).toEqual(statuses.flatMap(s => actions.map(a => `${s}:${a}`)).sort());
  });

  it.each(TABLE)("%s + %o", (status, action, expected) => {
    expect(nextStatus(status, action)).toEqual(expected);
  });

  it("only a correction requires a new revision", () => {
    for (const [status, action] of TABLE) {
      const result = nextStatus(status, action);
      if (result.ok) {
        expect(result.new_revision_required).toBe(action.type === "confirmation" && action.result === "corrected");
      }
    }
  });
});
