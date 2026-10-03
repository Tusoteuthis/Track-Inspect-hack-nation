import { describe, expect, it } from "vitest";
import type { EvidenceAsset, EvidenceRegion } from "@/lib/ui/contracts";
import {
  FULL_VIEWPORT,
  focusViewport,
  regionRenderState,
  regionToPercentRect,
  regionToPixelRect,
} from "@/lib/ui/regionGeometry";

const asset: EvidenceAsset = {
  asset_id: "a1",
  original_url: "/x.svg",
  highlighted_url: null,
  frame_id: "frame-1",
  width_px: 1600,
  height_px: 900,
};

const region = (over: Partial<EvidenceRegion> = {}): EvidenceRegion => ({
  frame_id: "frame-1",
  coordinate_space: "original_frame_normalized",
  x: 0.25,
  y: 0.5,
  width: 0.1,
  height: 0.2,
  mapping_status: "resolved",
  ...over,
});

describe("regionRenderState", () => {
  it("is none without a region", () => {
    expect(regionRenderState(asset, null)).toBe("none");
    expect(regionRenderState(asset, undefined)).toBe("none");
  });

  it("follows mapping status on the same frame", () => {
    expect(regionRenderState(asset, region())).toBe("resolved");
    expect(regionRenderState(asset, region({ mapping_status: "ambiguous" }))).toBe("ambiguous");
    expect(regionRenderState(asset, region({ mapping_status: "unresolved" }))).toBe("unresolved");
  });

  it("refuses a region from a different frame, whatever its status", () => {
    expect(regionRenderState(asset, region({ frame_id: "frame-2" }))).toBe("frame_mismatch");
    expect(
      regionRenderState(asset, region({ frame_id: "frame-2", mapping_status: "ambiguous" }))
    ).toBe("frame_mismatch");
  });

  it("flags geometry outside the normalized frame as invalid", () => {
    expect(regionRenderState(asset, region({ x: -0.1 }))).toBe("invalid");
    expect(regionRenderState(asset, region({ width: 0 }))).toBe("invalid");
    expect(regionRenderState(asset, region({ x: 0.95, width: 0.2 }))).toBe("invalid");
    expect(regionRenderState(asset, region({ y: Number.NaN }))).toBe("invalid");
  });
});

describe("regionToPercentRect", () => {
  it("maps onto the full image as percentages", () => {
    const rect = regionToPercentRect(region(), FULL_VIEWPORT);
    expect(rect.left).toBeCloseTo(25);
    expect(rect.top).toBeCloseTo(50);
    expect(rect.width).toBeCloseTo(10);
    expect(rect.height).toBeCloseTo(20);
  });

  it("maps relative to a focus viewport", () => {
    const viewport = { x: 0.2, y: 0.4, width: 0.4, height: 0.4 };
    const rect = regionToPercentRect(region(), viewport);
    expect(rect.left).toBeCloseTo(12.5);
    expect(rect.top).toBeCloseTo(25);
    expect(rect.width).toBeCloseTo(25);
    expect(rect.height).toBeCloseTo(50);
  });

  it("clips (not shifts) a region that extends past the viewport", () => {
    const viewport = { x: 0.3, y: 0.5, width: 0.5, height: 0.5 };
    const rect = regionToPercentRect(region({ x: 0.2, width: 0.2 }), viewport);
    expect(rect.left).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(20); // only the visible 0.3–0.4 slice
  });
});

describe("regionToPixelRect", () => {
  it.each([
    [1600, 900],
    [1000, 562.5],
    [333, 187.3],
    [3840, 2160],
  ])("stays within 1px of the exact region at %sx%s", (w, h) => {
    const px = regionToPixelRect(region(), w, h);
    expect(Math.abs(px.left - 0.25 * w)).toBeLessThanOrEqual(1);
    expect(Math.abs(px.top - 0.5 * h)).toBeLessThanOrEqual(1);
    expect(Math.abs(px.width - 0.1 * w)).toBeLessThanOrEqual(1);
    expect(Math.abs(px.height - 0.2 * h)).toBeLessThanOrEqual(1);
  });
});

describe("focusViewport", () => {
  it("pads the region by half its size on each side", () => {
    const vp = focusViewport(region({ x: 0.3, y: 0.3, width: 0.3, height: 0.3 }));
    expect(vp.x).toBeCloseTo(0.15);
    expect(vp.y).toBeCloseTo(0.15);
    expect(vp.width).toBeCloseTo(0.6);
    expect(vp.height).toBeCloseTo(0.6);
  });

  it("uses a minimum window around very small regions, centred", () => {
    const vp = focusViewport(region({ x: 0.49, y: 0.49, width: 0.02, height: 0.02 }));
    expect(vp.width).toBeCloseTo(0.2);
    expect(vp.height).toBeCloseTo(0.2);
    expect(vp.x + vp.width / 2).toBeCloseTo(0.5);
    expect(vp.y + vp.height / 2).toBeCloseTo(0.5);
  });

  it("clamps the window inside the image at the edges", () => {
    const vp = focusViewport(region({ x: 0.95, y: 0, width: 0.05, height: 0.05 }));
    expect(vp.x + vp.width).toBeCloseTo(1);
    expect(vp.y).toBeCloseTo(0);
    expect(vp.width).toBeCloseTo(0.2);
  });

  it("keeps the image's aspect ratio (equal normalized spans), so a tall region doesn't make a tall view", () => {
    const vp = focusViewport(region({ x: 0.4, y: 0.1, width: 0.05, height: 0.6 }));
    expect(vp.width).toBeCloseTo(vp.height);
    expect(vp.x).toBeLessThanOrEqual(0.4);
    expect(vp.x + vp.width).toBeGreaterThanOrEqual(0.45);
  });

  it("never exceeds the full image", () => {
    const vp = focusViewport(region({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }));
    expect(vp).toEqual(FULL_VIEWPORT);
  });

  it("always contains the region", () => {
    const r = region({ x: 0.8, y: 0.85, width: 0.2, height: 0.15 });
    const vp = focusViewport(r);
    expect(vp.x).toBeLessThanOrEqual(r.x);
    expect(vp.y).toBeLessThanOrEqual(r.y);
    expect(vp.x + vp.width).toBeGreaterThanOrEqual(r.x + r.width - 1e-9);
    expect(vp.y + vp.height).toBeGreaterThanOrEqual(r.y + r.height - 1e-9);
  });
});
