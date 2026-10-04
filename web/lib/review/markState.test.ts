import { describe, expect, it } from "vitest";
import { markKey, markReducer, markStatus } from "@/lib/review/markState";
import type { ReviewMark } from "@/lib/ui/contracts";

const mark: ReviewMark = { session_id: "s", entry_id: "e", revision_id: "r1", kind: "correction_requested" };
const key = markKey(mark);

describe("markReducer", () => {
  it("is idle until submitted, then pending until a response", () => {
    expect(markStatus({}, key)).toEqual({ state: "idle" });
    const pending = markReducer({}, { type: "submit", key });
    expect(markStatus(pending, key)).toEqual({ state: "pending" });
  });

  it("ignores a second submit while pending", () => {
    const pending = markReducer({}, { type: "submit", key });
    expect(markReducer(pending, { type: "submit", key })).toBe(pending);
  });

  it("shows acknowledged only after an acknowledgement", () => {
    const pending = markReducer({}, { type: "submit", key });
    const done = markReducer(pending, { type: "resolved", key, ack: { status: "acknowledged", value: { received_at_utc: "t" } } });
    expect(markStatus(done, key)).toEqual({ state: "acknowledged", received_at_utc: "t" });
  });

  it("shows a failure and allows a retry", () => {
    const pending = markReducer({}, { type: "submit", key });
    const failedState = markReducer(pending, { type: "resolved", key, ack: { status: "failed", error: "boom" } });
    expect(markStatus(failedState, key)).toEqual({ state: "failed", error: "boom" });
    expect(markStatus(markReducer(failedState, { type: "submit", key }), key)).toEqual({ state: "pending" });
  });

  it("ignores a response for a mark that is not pending", () => {
    const state = {};
    expect(markReducer(state, { type: "resolved", key, ack: { status: "failed", error: "late" } })).toBe(state);
  });

  it("keys by revision, entry and kind so a new revision starts fresh", () => {
    expect(markKey({ ...mark, revision_id: "r2" })).not.toBe(key);
    expect(markKey({ ...mark, kind: "flag_unresolved" })).not.toBe(key);
  });
});
