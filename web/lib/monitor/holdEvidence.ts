// Fixture mode only: stands in for the glasses' pointing detection when the
// monitor holds. The event uses the hold's own still frame, so the region is
// always drawn on the picture the expert saw. Live mode never uses this.
import videoHolds from "@/fixtures/ui/video-holds.json";
import { SCHEMA_VERSION, type PointingEvent } from "@/lib/expert/contracts";
import type { MediaHold } from "@/lib/ui/contracts";

type FixtureHoldRegion = { x: number; y: number; width: number; height: number; channel_id: string | null };
const REGIONS = videoHolds.holds as Record<string, FixtureHoldRegion>;

export function holdPointingEvent(input: {
  sessionId: string;
  caseId: string;
  hold: MediaHold;
  sessionTimeMs: number;
  now: Date;
}): PointingEvent | null {
  const { sessionId, caseId, hold } = input;
  const region = caseId === videoHolds.case_id ? REGIONS[hold.hold_id] : undefined;
  if (!region) return null;
  const frameId = `${caseId}-${hold.hold_id}`;
  return {
    schema_version: SCHEMA_VERSION,
    session_id: sessionId,
    event_id: `evt-${hold.hold_id}`,
    source: "fixture",
    captured_at_utc: input.now.toISOString(),
    session_time_ms: Math.max(0, Math.round(input.sessionTimeMs)),
    frame_id: frameId,
    image_ref: hold.frame_url,
    // No separate highlighted render: the viewer draws the region on the original frame.
    highlighted_image_ref: hold.frame_url,
    region: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      coordinate_space: "original_frame_normalized",
      frame_width_px: hold.frame_width_px,
      frame_height_px: hold.frame_height_px,
    },
    mapping_status: "resolved",
    trace_id: videoHolds.trace_id,
    channel_id: region.channel_id,
    signal_interval: null,
    record_state: "on_record",
    label: `FIXTURE: simulated pointing at monitor ${hold.hold_id}`,
    media_time_ms: hold.at_ms,
    hold_id: hold.hold_id,
  };
}
