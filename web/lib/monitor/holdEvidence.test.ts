import { describe, expect, it } from "vitest";
import { validatePointingEvent } from "@/lib/expert/contracts";
import type { MediaHold } from "@/lib/ui/contracts";
import { holdPointingEvent } from "./holdEvidence";

const HOLD: MediaHold = {
  hold_id: "hold-4",
  at_ms: 18_000,
  frame_url: "/fixtures/video/hold-4.jpg",
  frame_width_px: 832,
  frame_height_px: 464,
};

describe("holdPointingEvent", () => {
  it("builds a valid resolved pointing event on the hold's own frame", () => {
    const event = holdPointingEvent({
      sessionId: "fixture-session-001",
      caseId: "fixture-case-video-001",
      hold: HOLD,
      sessionTimeMs: 42_000,
      now: new Date("2026-10-04T10:00:00.000Z"),
    });
    expect(event).not.toBeNull();
    expect(validatePointingEvent(event)).toMatchObject({ ok: true });
    expect(event).toMatchObject({
      session_id: "fixture-session-001",
      source: "fixture",
      image_ref: "/fixtures/video/hold-4.jpg",
      mapping_status: "resolved",
      channel_id: "SYS2",
      signal_interval: null,
      media_time_ms: 18_000,
      hold_id: "hold-4",
      session_time_ms: 42_000,
      captured_at_utc: "2026-10-04T10:00:00.000Z",
    });
    expect(event!.region).toMatchObject({ frame_width_px: 832, frame_height_px: 464 });
    expect(event!.frame_id).toContain("hold-4");
  });

  it("returns null for a case or hold without fixture pointing", () => {
    expect(
      holdPointingEvent({ sessionId: "s", caseId: "other-case", hold: HOLD, sessionTimeMs: 0, now: new Date() })
    ).toBeNull();
    expect(
      holdPointingEvent({
        sessionId: "s",
        caseId: "fixture-case-video-001",
        hold: { ...HOLD, hold_id: "hold-9" },
        sessionTimeMs: 0,
        now: new Date(),
      })
    ).toBeNull();
  });
});
