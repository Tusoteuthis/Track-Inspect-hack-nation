// What the evaluator and the tutor consume from the learner's screen (Sprint 4, Lane B).
// WS7 captures it (screen-share stills, or the region the learner marked in the app), WS6 stores
// it as the draft's `visual_context`. One context is one observation on one frame: a region is
// only meaningful on the frame it was drawn on, so a marked region (app state, on the case's
// trace frame) and a screen-share still are separate contexts. Nothing here interprets the trace.

import type { Region } from "@/lib/expert/contracts";

export type ScreenContextSource = "screen_share" | "app_state";

export type LearnerScreenContext = {
  /** The frame the observation is on: a screen-share still, or the trace frame the region is drawn on. */
  frame_asset_id: string | null;
  /** Normalized box on that frame, as the learner marked it. */
  region: Region | null;
  visible_case_id: string;
  draft_rev: number;
  captured_at_utc: string;
  source: ScreenContextSource;
};

export class ScreenContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenContextError";
  }
}

const KEYS = ["frame_asset_id", "region", "visible_case_id", "draft_rev", "captured_at_utc", "source"] as const;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const unit = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const positiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

function regionProblem(r: unknown): string | null {
  if (typeof r !== "object" || r === null) return "region must be an object or null";
  const g = r as Record<string, unknown>;
  if (g.coordinate_space !== "original_frame_normalized") return 'region.coordinate_space must be "original_frame_normalized"';
  if (![g.x, g.y, g.width, g.height].every(unit)) return "region x/y/width/height must be in [0, 1]";
  if ((g.width as number) <= 0 || (g.height as number) <= 0) return "region must have a positive size";
  if ((g.x as number) + (g.width as number) > 1 || (g.y as number) + (g.height as number) > 1) return "region must lie inside the frame";
  if (!positiveInt(g.frame_width_px) || !positiveInt(g.frame_height_px)) return "region frame size must be positive integers";
  return null;
}

/** Allowlist validation: unknown fields are refused, so nothing else rides along to the evaluator. */
export function assertLearnerScreenContext(value: unknown): LearnerScreenContext {
  if (typeof value !== "object" || value === null) throw new ScreenContextError("screen context must be an object");
  const v = value as Record<string, unknown>;
  const extra = Object.keys(v).filter(k => !(KEYS as readonly string[]).includes(k));
  if (extra.length) throw new ScreenContextError(`unknown screen context fields: ${extra.join(", ")}`);
  if (v.source !== "screen_share" && v.source !== "app_state") throw new ScreenContextError('source must be "screen_share" or "app_state"');
  if (v.frame_asset_id !== null && !(typeof v.frame_asset_id === "string" && ID.test(v.frame_asset_id))) {
    throw new ScreenContextError("frame_asset_id must be an id or null");
  }
  if (typeof v.visible_case_id !== "string" || !ID.test(v.visible_case_id)) throw new ScreenContextError("visible_case_id must be an id");
  if (!Number.isInteger(v.draft_rev) || (v.draft_rev as number) < 1) throw new ScreenContextError("draft_rev must be an integer ≥ 1");
  if (typeof v.captured_at_utc !== "string" || !UTC.test(v.captured_at_utc)) throw new ScreenContextError("captured_at_utc must be ISO-8601 UTC");
  if (v.region !== null) {
    const problem = regionProblem(v.region);
    if (problem) throw new ScreenContextError(problem);
  }
  return value as LearnerScreenContext;
}

/**
 * The context to use for one evaluation: same case and draft revision only (older drafts' screens
 * are stale). A marked region wins over a bare still; among equals, the latest capture.
 */
export function screenContextFor(
  contexts: readonly LearnerScreenContext[],
  current: { draft_rev: number; case_id: string }
): LearnerScreenContext | null {
  const matching = contexts.filter(c => c.draft_rev === current.draft_rev && c.visible_case_id === current.case_id);
  const rank = (c: LearnerScreenContext) => (c.region ? 1 : 0);
  return (
    [...matching].sort((a, b) => rank(b) - rank(a) || Date.parse(b.captured_at_utc) - Date.parse(a.captured_at_utc))[0] ?? null
  );
}

// Position words only: where on the frame, never what the trace shows there.
function band(start: number, size: number, words: [string, string, string]): string {
  const centre = start + size / 2;
  return centre < 1 / 3 ? words[0] : centre < 2 / 3 ? words[1] : words[2];
}

function describeRegion(r: Region): string {
  const horizontal = band(r.x, r.width, ["left", "middle", "right"]);
  const vertical = band(r.y, r.height, ["upper", "middle", "lower"]);
  const where = horizontal === "middle" && vertical === "middle" ? "centre" : `${vertical} ${horizontal}`;
  const span = Math.round(r.width * 100);
  return `in the ${where} part of the frame, about ${span} percent of its width`;
}

const SOURCE_WORDS: Record<ScreenContextSource, string> = { screen_share: "shared screen", app_state: "app state" };

function describeOne(c: LearnerScreenContext): string {
  const frame = c.frame_asset_id ? `frame ${c.frame_asset_id}` : "no frame";
  const what = c.region ? `The learner marked a region ${describeRegion(c.region)}` : "The learner's screen, no region marked";
  return `${what} (${frame}, from ${SOURCE_WORDS[c.source]}).`;
}

/**
 * Text for the evaluator's `visual_context` and the tutor's context block. No case id (the judge
 * must not see it), no capture time, no values read off the trace.
 */
export function describeScreenContext(context: LearnerScreenContext | readonly LearnerScreenContext[] | null): string {
  const list = context === null ? [] : Array.isArray(context) ? context : [context as LearnerScreenContext];
  if (!list.length) return "No screen context: the learner has not marked a region.";
  return list.map(describeOne).join(" ");
}

// --- WS6 / WS7 mapping ----------------------------------------------------------

/** WS6 `LearnerDraft.visual_context` entry. */
export type Ws6VisualContext = { asset_id: string; region: Region | null };

export function toWs6VisualContext(c: LearnerScreenContext): Ws6VisualContext[] {
  return c.frame_asset_id ? [{ asset_id: c.frame_asset_id, region: c.region }] : [];
}

/**
 * Back from a stored WS6 draft. WS6 keeps only `{asset_id, region}`, so the source is inferred
 * (a region means the learner marked it) and the capture time is the draft's update time.
 */
export function fromWs6VisualContext(
  draft: { draft_rev: number; updated_at_utc: string; visual_context: readonly Ws6VisualContext[] },
  case_id: string
): LearnerScreenContext | null {
  const first = draft.visual_context.find(v => v.region) ?? draft.visual_context[0];
  if (!first) return null;
  return assertLearnerScreenContext({
    frame_asset_id: first.asset_id,
    region: first.region,
    visible_case_id: case_id,
    draft_rev: draft.draft_rev,
    captured_at_utc: draft.updated_at_utc,
    source: first.region ? "app_state" : "screen_share",
  });
}

/** WS7 `EvidenceRegion` (normalized, no pixel size) and `ScreenFrameRef`, structurally. */
export type Ws7Region = {
  frame_id: string;
  coordinate_space: "original_frame_normalized";
  x: number;
  y: number;
  width: number;
  height: number;
  mapping_status?: string;
};
export type Ws7FrameRef = { frame_id: string; captured_at_utc: string; draft_revision: number };

/**
 * WS7 practice state → contexts for the current draft. The marked region is app state on the
 * case's trace frame (needs that frame's pixel size); a screen-share still is observation of the
 * learner's screen with no region on it (WS7 does not map regions into stills).
 */
export function fromPracticeState(input: {
  draft: { draft_revision: number; region: Ws7Region | null };
  frame: Ws7FrameRef | null;
  case_id: string;
  frame_size: { width_px: number; height_px: number } | null;
  now_utc: string;
}): LearnerScreenContext[] {
  const out: LearnerScreenContext[] = [];
  const { draft, frame, case_id, frame_size } = input;
  if (draft.region && frame_size) {
    const r = draft.region;
    out.push(
      assertLearnerScreenContext({
        frame_asset_id: r.frame_id,
        region: {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          coordinate_space: r.coordinate_space,
          frame_width_px: frame_size.width_px,
          frame_height_px: frame_size.height_px,
        },
        visible_case_id: case_id,
        draft_rev: draft.draft_revision,
        captured_at_utc: input.now_utc,
        source: "app_state",
      })
    );
  }
  if (frame && frame.draft_revision === draft.draft_revision) {
    out.push(
      assertLearnerScreenContext({
        frame_asset_id: frame.frame_id,
        region: null,
        visible_case_id: case_id,
        draft_rev: draft.draft_revision,
        captured_at_utc: frame.captured_at_utc,
        source: "screen_share",
      })
    );
  }
  return out;
}
