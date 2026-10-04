import { describe, expect, it } from "vitest";
import type { Region } from "@/lib/expert/contracts";
import {
  assertLearnerScreenContext,
  describeScreenContext,
  fromPracticeState,
  fromWs6VisualContext,
  ScreenContextError,
  screenContextFor,
  toWs6VisualContext,
  type LearnerScreenContext,
} from "../observation";

const region: Region = {
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.2,
  coordinate_space: "original_frame_normalized",
  frame_width_px: 1600,
  frame_height_px: 900,
};

const screen = (over: Partial<LearnerScreenContext> = {}): LearnerScreenContext => ({
  frame_asset_id: "frm-001",
  region,
  visible_case_id: "fx-case-102",
  draft_rev: 2,
  captured_at_utc: "2026-10-04T10:00:00.000Z",
  source: "screen_share",
  ...over,
});

describe("assertLearnerScreenContext", () => {
  it("accepts a screen-share context and an app-state context without frame or region", () => {
    expect(assertLearnerScreenContext(screen())).toEqual(screen());
    const app = screen({ frame_asset_id: null, region: null, source: "app_state" });
    expect(assertLearnerScreenContext(app)).toEqual(app);
  });

  it.each([
    ["bad source", { source: "camera" }],
    ["bad frame id", { frame_asset_id: "Frame 1" }],
    ["missing case", { visible_case_id: "" }],
    ["draft_rev 0", { draft_rev: 0 }],
    ["not UTC", { captured_at_utc: "yesterday" }],
    ["region out of the frame", { region: { ...region, x: 0.9, width: 0.3 } }],
    ["empty region", { region: { ...region, width: 0 } }],
    ["wrong coordinate space", { region: { ...region, coordinate_space: "pixels" } }],
  ])("rejects %s", (_name, over) => {
    expect(() => assertLearnerScreenContext({ ...screen(), ...over })).toThrow(ScreenContextError);
  });

  it("rejects unknown fields, so nothing else rides along to the evaluator", () => {
    expect(() => assertLearnerScreenContext({ ...screen(), expected_decision: "x" })).toThrow(ScreenContextError);
  });
});

describe("screenContextFor", () => {
  it("returns the latest context of the same case and draft revision", () => {
    const older = screen({ captured_at_utc: "2026-10-04T10:00:00.000Z", frame_asset_id: "frm-001" });
    const newer = screen({ captured_at_utc: "2026-10-04T10:00:05.000Z", frame_asset_id: "frm-002" });
    expect(screenContextFor([newer, older], { draft_rev: 2, case_id: "fx-case-102" })?.frame_asset_id).toBe("frm-002");
  });

  it("drops contexts of another draft revision or another case", () => {
    const stale = [screen({ draft_rev: 1 }), screen({ visible_case_id: "fx-case-999" })];
    expect(screenContextFor(stale, { draft_rev: 2, case_id: "fx-case-102" })).toBeNull();
  });
});

describe("describeScreenContext", () => {
  it("describes the marked region's position on the frame without the case id", () => {
    const text = describeScreenContext(screen());
    expect(text).toContain("marked a region");
    expect(text).toContain("left");
    expect(text).toContain("upper");
    expect(text).toContain("frm-001");
    expect(text).toContain("shared screen");
    expect(text).not.toContain("fx-case-102");
  });

  it("is honest when nothing was marked or captured", () => {
    expect(describeScreenContext(null)).toBe("No screen context: the learner has not marked a region.");
    const text = describeScreenContext(screen({ region: null, frame_asset_id: null, source: "app_state" }));
    expect(text).toContain("no region marked");
    expect(text).toContain("app state");
  });

  it("never states signal values or timestamps read off the trace", () => {
    const text = describeScreenContext(screen());
    expect(text).not.toMatch(/\d+(\.\d+)?\s*(ms|s|mm|km|hz)\b/i);
    expect(text).not.toContain("2026-10-04");
  });
});

describe("WS6 / WS7 mapping", () => {
  it("maps to WS6 visual_context (frame_asset_id → asset_id) and back", () => {
    expect(toWs6VisualContext(screen())).toEqual([{ asset_id: "frm-001", region }]);
    expect(toWs6VisualContext(screen({ frame_asset_id: null }))).toEqual([]);
    const back = fromWs6VisualContext(
      { draft_rev: 2, updated_at_utc: "2026-10-04T10:00:00.000Z", visual_context: [{ asset_id: "frm-001", region }] },
      "fx-case-102"
    );
    expect(back).toEqual(screen({ source: "app_state" }));
    expect(fromWs6VisualContext({ draft_rev: 2, updated_at_utc: "2026-10-04T10:00:00.000Z", visual_context: [] }, "c")).toBeNull();
  });

  it("maps WS7 practice state to up to two contexts: the region on its trace frame (app_state) and the shared still", () => {
    const draft = {
      draft_revision: 2,
      region: { frame_id: "frm-001", coordinate_space: "original_frame_normalized" as const, x: 0.1, y: 0.2, width: 0.3, height: 0.2, mapping_status: "resolved" as const },
    };
    const both = fromPracticeState({
      draft,
      frame: { frame_id: "frm-009", captured_at_utc: "2026-10-04T10:00:00.000Z", draft_revision: 2 },
      case_id: "fx-case-102",
      frame_size: { width_px: 1600, height_px: 900 },
      now_utc: "2026-10-04T10:00:01.000Z",
    });
    expect(both).toEqual([
      screen({ source: "app_state", captured_at_utc: "2026-10-04T10:00:01.000Z" }),
      screen({ frame_asset_id: "frm-009", region: null }),
    ]);
    // The region context wins for the evaluator and tutor; the still is kept as observation evidence.
    expect(screenContextFor(both, { draft_rev: 2, case_id: "fx-case-102" })?.source).toBe("app_state");
  });

  it("drops a region whose frame size is unknown and a still from another draft revision", () => {
    const ctx = fromPracticeState({
      draft: {
        draft_revision: 3,
        region: { frame_id: "frm-001", coordinate_space: "original_frame_normalized" as const, x: 0.1, y: 0.2, width: 0.3, height: 0.2, mapping_status: "resolved" as const },
      },
      frame: { frame_id: "frm-009", captured_at_utc: "2026-10-04T10:00:00.000Z", draft_revision: 2 },
      case_id: "fx-case-102",
      frame_size: null,
      now_utc: "2026-10-04T10:00:01.000Z",
    });
    expect(ctx).toEqual([]);
  });

  it("describes a region context together with the shared still", () => {
    const text = describeScreenContext([screen({ source: "app_state" }), screen({ frame_asset_id: "frm-009", region: null })]);
    expect(text).toContain("marked a region");
    expect(text).toContain("frm-009");
  });
});
