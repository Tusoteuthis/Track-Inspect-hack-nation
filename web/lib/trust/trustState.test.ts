import { describe, expect, it } from "vitest";
import { revokeKey, deleteKey, trustReducer, trustStatus, type TrustMap } from "@/lib/trust/trustState";

const empty: TrustMap = {};

describe("trustReducer", () => {
  it("is idle until submitted, then pending", () => {
    expect(trustStatus(empty, "k")).toEqual({ state: "idle" });
    const s = trustReducer(empty, { type: "submit", key: "k" });
    expect(trustStatus(s, "k")).toEqual({ state: "pending" });
  });

  it("ignores a second submit while pending (no double request)", () => {
    const s = trustReducer(empty, { type: "submit", key: "k" });
    expect(trustReducer(s, { type: "submit", key: "k" })).toBe(s);
  });

  it("is acknowledged only by an acknowledged Ack", () => {
    const s = trustReducer(empty, { type: "submit", key: "k" });
    const done = trustReducer(s, { type: "resolved", key: "k", ack: { status: "acknowledged", value: {} } });
    expect(trustStatus(done, "k").state).toBe("acknowledged");
  });

  it("keeps the failure message on a failed Ack and allows a retry", () => {
    const s = trustReducer(empty, { type: "submit", key: "k" });
    const failedState = trustReducer(s, { type: "resolved", key: "k", ack: { status: "failed", error: "nope" } });
    expect(trustStatus(failedState, "k")).toEqual({ state: "failed", error: "nope" });
    expect(trustStatus(trustReducer(failedState, { type: "submit", key: "k" }), "k").state).toBe("pending");
  });

  it("ignores a resolution that is not pending (late or duplicate ack)", () => {
    const s = trustReducer(empty, { type: "resolved", key: "k", ack: { status: "acknowledged", value: {} } });
    expect(s).toBe(empty);
  });

  it("does not resubmit an acknowledged action", () => {
    const s = trustReducer(trustReducer(empty, { type: "submit", key: "k" }), {
      type: "resolved",
      key: "k",
      ack: { status: "acknowledged", value: {} },
    });
    expect(trustReducer(s, { type: "submit", key: "k" })).toBe(s);
  });

  it("keys revocations by entry and deletions by event", () => {
    expect(revokeKey("e1")).not.toBe(revokeKey("e2"));
    expect(deleteKey("ev1")).not.toBe(revokeKey("ev1"));
  });
});
