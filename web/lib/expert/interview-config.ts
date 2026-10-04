import type { InterviewConfig } from "./contracts";

/**
 * Sprint 2 timing defaults (`pause_ms` tuned in the human gate) and the Sprint 5 budgets from
 * notes/voice-agent-strategy-handoff.md (user decisions D1–D7 in sprint-5-strategy-alignment.md).
 */
export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  dedup_min_iou: 0.5,
  stale_after_ms: 30_000,
  budget_max_questions: 5,
  topic_max_followups: 1,
  orient_max_questions: 2,
  debrief_max_gaps: 3,
  teach_back_max_corrections: 1,
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
