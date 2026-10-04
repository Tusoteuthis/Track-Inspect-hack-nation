// WS3 PointingEvent → what the companion draws. The asset is the event's own
// captured frame, so EvidenceViewer's frame check can never pass for a region
// on a different picture.
import type { PointingEvent } from "@/lib/expert/contracts";
import type { CompanionEvent } from "@/lib/ui/contracts";

export function eventToEvidence(event: PointingEvent): CompanionEvent {
  const { region } = event;
  return {
    event_id: event.event_id,
    captured_at_utc: event.captured_at_utc,
    session_time_ms: event.session_time_ms,
    asset: {
      asset_id: event.event_id,
      original_url: event.image_ref,
      highlighted_url: event.highlighted_image_ref,
      frame_id: event.frame_id,
      width_px: region.frame_width_px,
      height_px: region.frame_height_px,
    },
    region: {
      frame_id: event.frame_id,
      coordinate_space: region.coordinate_space,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      mapping_status: event.mapping_status,
    },
    record_state: event.record_state,
    channel_label: event.channel_id,
  };
}
