import { describe, expect, it } from "vitest";
import { validatePointingEvent } from "./contracts";
import { FIXTURE_EVENTS } from "./fixtures";

describe("FIXTURE_EVENTS", () => {
  it("bundles the five valid fixtures in order", () => {
    expect(FIXTURE_EVENTS.map(e => e.event_id)).toEqual(["evt-001", "evt-002", "evt-003", "evt-004", "evt-005"]);
    for (const e of FIXTURE_EVENTS) {
      expect(validatePointingEvent(e).ok).toBe(true);
      expect(e.source).toBe("fixture");
    }
  });
});
