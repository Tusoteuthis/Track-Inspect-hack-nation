// Pure "is the expert speaking?" detector. None of the voice signals carry timestamps,
// so callers stamp them on receipt (performance.now()). Sound or transcript activity is
// all it sees: silence here does not prove the expert has finished thinking.

import type { InterviewConfig } from "./contracts";

export type SpeechState = {
  speaking: boolean;
  /** Last time any signal showed the expert talking (including final lines). */
  last_activity_perf: number | null;
};

export type SpeechObservation =
  | { kind: "vad"; score: number } // server VAD, 0–1
  | { kind: "mic"; level: number } // local input volume, 0–1
  | { kind: "tentative" } // tentative user transcript arrived
  | { kind: "final" }; // final user line arrived (after the speech itself)

export type SpeechTransition = { speaking: boolean; at_perf: number } | null;

type Thresholds = Pick<InterviewConfig, "vad_threshold" | "mic_threshold" | "speech_hold_ms">;

export const initialSpeech = (): SpeechState => ({ speaking: false, last_activity_perf: null });

export function observeSpeech(
  state: SpeechState,
  obs: SpeechObservation,
  now: number,
  ctx: { agent_speaking: boolean },
  config: Thresholds
): { state: SpeechState; transition: SpeechTransition } {
  if (obs.kind === "final") {
    const last = Math.max(state.last_activity_perf ?? now, now);
    return { state: { ...state, last_activity_perf: last }, transition: null };
  }
  const active =
    obs.kind === "tentative" ||
    (obs.kind === "vad" && obs.score >= config.vad_threshold) ||
    // the mic hears the agent's own voice while it talks
    (obs.kind === "mic" && !ctx.agent_speaking && obs.level >= config.mic_threshold);
  if (!active) return { state, transition: null };
  const next = { speaking: true, last_activity_perf: now };
  return { state: next, transition: state.speaking ? null : { speaking: true, at_perf: now } };
}

/** Closes a speaking interval once no signal arrived for `speech_hold_ms`. */
export function settleSpeech(
  state: SpeechState,
  now: number,
  config: Thresholds
): { state: SpeechState; transition: SpeechTransition } {
  const last = state.last_activity_perf;
  if (!state.speaking || last === null || now - last < config.speech_hold_ms) return { state, transition: null };
  return { state: { ...state, speaking: false }, transition: { speaking: false, at_perf: last } };
}

export function quietForMs(state: SpeechState, now: number): number {
  if (state.speaking) return 0;
  return state.last_activity_perf === null ? Number.POSITIVE_INFINITY : now - state.last_activity_perf;
}
