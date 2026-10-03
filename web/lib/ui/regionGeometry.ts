// Pure geometry for drawing an evidence region on its image. Coordinates are
// normalized ([0, 1], origin top-left) on the original saved frame.
import type { EvidenceAsset, EvidenceRegion } from "@/lib/ui/contracts";

/** A normalized window onto the image. */
export type Viewport = { x: number; y: number; width: number; height: number };

/** Percentages relative to a viewport, ready for CSS positioning. */
export type PercentRect = { left: number; top: number; width: number; height: number };

export type RegionRenderState =
  | "none"
  | "resolved"
  | "ambiguous"
  | "unresolved"
  | "frame_mismatch"
  | "invalid";

export const FULL_VIEWPORT: Viewport = { x: 0, y: 0, width: 1, height: 1 };

const EPS = 1e-9;

function isValidGeometry(r: EvidenceRegion): boolean {
  const values = [r.x, r.y, r.width, r.height];
  if (!values.every(Number.isFinite)) return false;
  if (r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0) return false;
  return r.x + r.width <= 1 + EPS && r.y + r.height <= 1 + EPS;
}

/**
 * Decides whether and how a region may be drawn. The frame check comes first:
 * coordinates from another frame are meaningless here, so nothing is drawn.
 */
export function regionRenderState(
  asset: EvidenceAsset,
  region: EvidenceRegion | null | undefined
): RegionRenderState {
  if (!region) return "none";
  if (region.frame_id !== asset.frame_id) return "frame_mismatch";
  if (!isValidGeometry(region)) return "invalid";
  return region.mapping_status;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Region as percentages of the viewport, clipped to the viewport (never shifted). */
export function regionToPercentRect(region: EvidenceRegion, viewport: Viewport): PercentRect {
  const x0 = clamp(region.x, viewport.x, viewport.x + viewport.width);
  const y0 = clamp(region.y, viewport.y, viewport.y + viewport.height);
  const x1 = clamp(region.x + region.width, viewport.x, viewport.x + viewport.width);
  const y1 = clamp(region.y + region.height, viewport.y, viewport.y + viewport.height);
  return {
    left: ((x0 - viewport.x) / viewport.width) * 100,
    top: ((y0 - viewport.y) / viewport.height) * 100,
    width: ((x1 - x0) / viewport.width) * 100,
    height: ((y1 - y0) / viewport.height) * 100,
  };
}

/** Region in display pixels for an image rendered at width × height. */
export function regionToPixelRect(region: EvidenceRegion, width: number, height: number) {
  const pct = regionToPercentRect(region, FULL_VIEWPORT);
  return {
    left: (pct.left / 100) * width,
    top: (pct.top / 100) * height,
    width: (pct.width / 100) * width,
    height: (pct.height / 100) * height,
  };
}

/**
 * Crop to show the region with context: padding per side as a fraction of
 * region size. Both axes use the same normalized span, so the crop keeps the
 * image's aspect ratio and a tall or thin region never yields a distorted view.
 */
export function focusViewport(
  region: EvidenceRegion,
  { padding = 0.5, minSize = 0.2 }: { padding?: number; minSize?: number } = {}
): Viewport {
  const needed = Math.max(region.width, region.height) * (1 + 2 * padding);
  const span = clamp(Math.max(needed, minSize), 0, 1);
  const place = (start: number, size: number) => clamp(start + size / 2 - span / 2, 0, 1 - span);
  return { x: place(region.x, region.width), y: place(region.y, region.height), width: span, height: span };
}
