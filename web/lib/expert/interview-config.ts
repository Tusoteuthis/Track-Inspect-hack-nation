import type { InterviewConfig } from "./contracts";

/** Sprint 2 defaults; `pause_ms` is tuned in the human gate (see handoff-sprint-2.md). */
export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  dedup_window_ms: 20_000,
  dedup_min_iou: 0.5,
  stale_after_ms: 30_000,
  budget_max_questions: 5,
  budget_window_ms: 600_000,
  pause_ms: 1200,
  release_timeout_ms: 30_000,
  nudge_after_ms: 2500,
  speech_hold_ms: 400,
  vad_threshold: 0.5,
  mic_threshold: 0.04,
};

/** Defaults overridden by every valid (finite, ≥ 0) value in `partial`. */
export function withConfig(partial: Partial<InterviewConfig>, base: InterviewConfig = DEFAULT_INTERVIEW_CONFIG): InterviewConfig {
  const next = { ...base };
  for (const key of Object.keys(base) as (keyof InterviewConfig)[]) {
    const v = partial[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) next[key] = v;
  }
  return next;
}
