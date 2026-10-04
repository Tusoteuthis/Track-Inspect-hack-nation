import { describe, expect, it } from "vitest";
import evt001 from "@/fixtures/pointing-events/evt-001-resolved.json";
import evt004 from "@/fixtures/pointing-events/evt-004-ambiguous.json";
import { eventToEvidence } from "@/lib/companion/eventToEvidence";
import type { PointingEvent } from "@/lib/expert/contracts";
import { regionRenderState } from "@/lib/ui/regionGeometry";

const RESOLVED = evt001 as PointingEvent;
const AMBIGUOUS = evt004 as PointingEvent;

describe("eventToEvidence", () => {
  it("builds the asset from the event's own frame and original image", () => {
    const e = eventToEvidence(RESOLVED);
    expect(e.asset).toEqual({
      asset_id: "evt-001",
      original_url: "/fixtures/trace-a-full.svg",
      highlighted_url: "/fixtures/trace-a-evt-001-highlight.svg",
      frame_id: "frame-0001",
      width_px: 1600,
      height_px: 900,
    });
    expect(e.region).toEqual({
      frame_id: "frame-0001",
      coordinate_space: "original_frame_normalized",
      x: 0.2,
      y: 0.15,
      width: 0.15,
      height: 0.25,
      mapping_status: "resolved",
    });
    expect(regionRenderState(e.asset, e.region)).toBe("resolved");
  });

  it("keeps mapping status, record state, session time and unknown channel", () => {
    const e = eventToEvidence(AMBIGUOUS);
    expect(regionRenderState(e.asset, e.region)).toBe("ambiguous");
    expect(e.channel_label).toBeNull();
    expect(e.session_time_ms).toBe(34000);
    expect(e.record_state).toBe("on_record");
    expect(eventToEvidence(RESOLVED).channel_label).toBe("SYS1");
  });

  it("an event's region is refused on any other frame", () => {
    const a = eventToEvidence(RESOLVED);
    const b = eventToEvidence(AMBIGUOUS);
    expect(regionRenderState(b.asset, a.region)).toBe("frame_mismatch");
  });

  it("never copies the dev-only label", () => {
    expect(JSON.stringify(eventToEvidence(RESOLVED))).not.toContain("FIXTURE:");
  });
});
