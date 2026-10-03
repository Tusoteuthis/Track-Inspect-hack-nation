// Pointer drag → normalized rectangle on the practice trace's own frame.
// The learner's marked region is a simple rectangle, not a chart annotation.
import type { EvidenceRegion } from "@/lib/ui/contracts";

export type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };

/** Smallest side, as a fraction of the frame, that counts as a deliberate region. */
export const MIN_REGION_SIZE = 0.02;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function clientToNormalized(clientX: number, clientY: number, rect: Rect): Point {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function pointsToRegion(a: Point, b: Point, frameId: string): EvidenceRegion | null {
  const x0 = clamp01(Math.min(a.x, b.x));
  const y0 = clamp01(Math.min(a.y, b.y));
  const width = clamp01(Math.max(a.x, b.x)) - x0;
  const height = clamp01(Math.max(a.y, b.y)) - y0;
  if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null;
  return {
    frame_id: frameId,
    coordinate_space: "original_frame_normalized",
    x: x0,
    y: y0,
    width,
    height,
    mapping_status: "resolved",
  };
}
