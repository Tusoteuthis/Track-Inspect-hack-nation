// Off-record handling: recording segments and in-memory exclusion. Anything said, pointed at
// or timed while off the record is dropped here, before a snapshot is ever built; the saved
// record keeps only the segment times and counts. Spec:
// specs/20261004-081433-ws3-sprint-4-trust-completion (research.md §1–4)

import {
  type AnswerLine,
  type OffRecordExcluded,
  type RecordState,
  type RecordStateTrigger,
  type RecordingSegment,
  isInsideOffRecord,
  offRecordIntervals,
} from "./contracts";
import type { SessionState } from "./session";
import { type Stamp, closeActive } from "./session-util";

/** Returned to the LLM for any recording tool while off the record (the probes' mock uses the same words). */
export const OFF_RECORD_REFUSAL =
  "error the expert is off the record: ask nothing and record nothing; call skip_turn until they go back on the record.";

export const RECORD_STATE_RESULT: Record<RecordState, string> = {
  off_record:
    'ok record_state=off_record. Say only a brief acknowledgement such as "Okay, off the record." Then ask nothing and call skip_turn on every turn until the expert goes back on the record. Never mention or ask about anything said while off the record.',
  on_record:
    'ok record_state=on_record. Acknowledge briefly ("Okay, back on the record.") and continue where you left off. Never mention or ask about anything said while off the record.',
};

const OFF_PHRASE = /\b(off (the )?record|stop recording|don'?t record (this|that)|do not record (this|that))\b/i;
const ON_PHRASE = /\b(back on (the )?record|on the record again|resume recording|start recording again|you can record again)\b/i;

/** Spoken off/on-record requests in one final expert line. */
export function detectRecordPhrase(text: string): { off: boolean; on: boolean } {
  const on = ON_PHRASE.test(text);
  // "back on the record" must not count as an off request because it contains "on the record"
  const off = OFF_PHRASE.test(text.replace(ON_PHRASE, ""));
  return { off, on };
}

/** How far back the utterance that asked to go off the record is searched for. */
export const RETRO_WINDOW_MS = 30_000;

export const currentSegment = (s: Pick<SessionState, "recording_segments">): RecordingSegment => s.recording_segments.at(-1)!;
export const currentRecordState = (s: Pick<SessionState, "recording_segments">): RecordState => currentSegment(s).state;
export const isOffRecord = (s: Pick<SessionState, "recording_segments">) => currentRecordState(s) === "off_record";

/** True while off the record, or when `at_utc` falls inside any earlier off-record segment. */
export function excludedAt(s: Pick<SessionState, "recording_segments">, at_utc: string): boolean {
  return isOffRecord(s) || isInsideOffRecord(offRecordIntervals(s.recording_segments), at_utc);
}

export function countExcluded(s: SessionState, key: keyof OffRecordExcluded, n = 1): SessionState {
  return n ? { ...s, off_record_excluded: { ...s.off_record_excluded, [key]: s.off_record_excluded[key] + n } } : s;
}

const ms = (iso: string) => Date.parse(iso);

/**
 * Where an off-record segment really starts. "Off the record, X" is usually one utterance,
 * transcribed before the agent calls the tool, so that utterance (and anything after it) is
 * excluded too: the latest expert line naming an off-record request within the window, or —
 * for a paraphrased request the agent recognised — just the latest expert line.
 */
function retroStart(state: SessionState, at: Stamp, trigger: RecordStateTrigger): string {
  if (trigger !== "agent_tool" && trigger !== "expert_phrase") return at.at_utc;
  const recent = state.transcript.filter(t => t.role === "user" && ms(at.at_utc) - ms(t.at_utc) <= RETRO_WINDOW_MS && ms(t.at_utc) <= ms(at.at_utc));
  const lastAgent = state.transcript.filter(t => t.role === "agent").at(-1);
  const unanswered = recent.at(-1) && (!lastAgent || ms(recent.at(-1)!.at_utc) >= ms(lastAgent.at_utc)) ? recent.at(-1) : undefined;
  const request = [...recent].reverse().find(t => detectRecordPhrase(t.text).off) ?? (trigger === "agent_tool" ? unanswered : undefined);
  const start = request && ms(request.at_utc) < ms(at.at_utc) ? request.at_utc : at.at_utc;
  // never reach back into an earlier segment
  const floor = currentSegment(state).started_at_utc;
  return ms(start) < ms(floor) ? floor : start;
}

/** Removes everything stamped at or after `from` (lines, answer lines, marks); counts it. */
function dropFrom(state: SessionState, from: string): SessionState {
  const keep = (at: string) => ms(at) < ms(from);
  const trimLines = (lines: AnswerLine[]) => lines.filter(l => keep(l.at_utc));
  const transcript = state.transcript.filter(t => keep(t.at_utc));
  const timing = state.timing.filter(m => keep(m.at_utc));
  const exchanges = state.exchanges.map(x => {
    const answer_lines = trimLines(x.answer_lines);
    if (answer_lines.length === x.answer_lines.length) return x;
    return {
      ...x,
      answer_lines,
      answer_started_at_utc: answer_lines[0]?.at_utc ?? null,
      answer_ended_at_utc: answer_lines.at(-1)?.at_utc ?? null,
    };
  });
  const next = { ...state, transcript, timing, exchanges, preamble: trimLines(state.preamble) };
  return countExcluded(countExcluded(next, "transcript_lines", state.transcript.length - transcript.length), "timing_marks", state.timing.length - timing.length);
}

/**
 * Changes the record state. Off: closes the active exchange, drops the triggering utterance
 * and opens an off-record segment. On: only the expert (voice, console) ends a segment —
 * a capture event may only end a segment that a capture event started.
 */
export function switchRecordState(state: SessionState, to: RecordState, trigger: RecordStateTrigger, at: Stamp): SessionState {
  const current = currentSegment(state);
  if (current.state === to) return state;
  if (to === "on_record" && trigger === "capture_event" && current.trigger !== "capture_event") return state;

  let next = state;
  let start = at.at_utc;
  if (to === "off_record") {
    start = retroStart(state, at, trigger);
    next = dropFrom(closeActive(state), start);
  }
  const n = state.recording_segments.length + 1;
  const segments = [
    ...state.recording_segments.slice(0, -1),
    { ...current, ended_at_utc: start },
    { segment_id: `seg-${String(n).padStart(3, "0")}`, state: to, started_at_utc: start, ended_at_utc: null, trigger },
  ];
  return { ...next, recording_segments: segments };
}
