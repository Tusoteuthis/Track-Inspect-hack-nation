import { describe, expect, it } from "vitest";
import { MIN_REGION_SIZE, clientToNormalized, pointsToRegion } from "@/lib/practice/regionDraw";

const rect = { left: 100, top: 50, width: 800, height: 450 };

describe("clientToNormalized", () => {
  it("maps client pixels into [0,1] relative to the frame", () => {
    expect(clientToNormalized(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToNormalized(900, 500, rect)).toEqual({ x: 1, y: 1 });
    expect(clientToNormalized(500, 275, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps points dragged outside the frame", () => {
    expect(clientToNormalized(0, 1000, rect)).toEqual({ x: 0, y: 1 });
  });
});

describe("pointsToRegion", () => {
  it("builds a resolved region on the given frame regardless of drag direction", () => {
    const a = pointsToRegion({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.1 }, "frame-b");
    expect(a).not.toBeNull();
    expect(a).toMatchObject({
      frame_id: "frame-b",
      coordinate_space: "original_frame_normalized",
      mapping_status: "resolved",
    });
    expect(a!.x).toBeCloseTo(0.2);
    expect(a!.y).toBeCloseTo(0.1);
    expect(a!.width).toBeCloseTo(0.4);
    expect(a!.height).toBeCloseTo(0.6);
  });

  it("returns null for a click or a sliver (too small to be a region)", () => {
    expect(pointsToRegion({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, "f")).toBeNull();
    expect(pointsToRegion({ x: 0.5, y: 0.5 }, { x: 0.5 + MIN_REGION_SIZE / 2, y: 0.9 }, "f")).toBeNull();
  });

  it("clamps out-of-range points so the region stays inside the frame", () => {
    const r = pointsToRegion({ x: -0.2, y: 0.5 }, { x: 1.4, y: 1.2 }, "f")!;
    expect(r.x).toBe(0);
    expect(r.x + r.width).toBeCloseTo(1);
    expect(r.y + r.height).toBeCloseTo(1);
  });
});
