// Best-effort resume after a dropped ElevenLabs connection: the same session continues in a new
// conversation. The agent gets a state summary (ids, phase, open gaps), never the transcript.

import { currentRecordState } from "./record-state";
import type { SessionState } from "./session";
import { withPhase } from "./debrief";
import type { Stamp } from "./session-util";

export const RESUME_CONTEXT_ID = "ws3-resume";

/** Reopens an ended, unconfirmed session in the phase it had before it ended. */
export function resumeSession(state: SessionState, at: Stamp): SessionState {
  if (state.ended_at_utc === null || state.phase !== "incomplete") return state;
  const before = [...state.phase_log].reverse().find(p => p.phase !== "incomplete")?.phase ?? "live";
  const reopened = { ...state, ended_at_utc: null, end_cause: null, phase: "incomplete" as const };
  return withPhase(reopened, before, "resume", at);
}

export function resumeSummary(state: SessionState): string {
  const answered = state.topics.filter(t => t.state === "answered" || t.state === "asked").map(t => `${t.primary_event_id} (${t.channel_id ?? "unknown channel"})`);
  const open = state.debrief_agenda.filter(g => g.state === "open").map(g => g.gap_id);
  const rev = state.revisions.at(-1);
  const parts = [
    `[RESUME] The connection dropped; this is the same expert session continuing (session ${state.session_id}). Do not greet again and do not repeat questions that were already asked.`,
    `Current phase ${state.phase}; record state ${currentRecordState(state)}.`,
    `Live questions asked so far: ${state.exchanges.filter(x => x.phase === "live" && x.question).length}; regions discussed: ${answered.join(", ") || "none"}.`,
  ];
  if (state.phase === "debrief") parts.push(`Open debrief gaps: ${open.join(", ") || "none"}.`);
  if (rev) parts.push(`Latest draft ${rev.revision_id}: ${state.phase === "confirmed" ? "confirmed" : "not confirmed yet"}.`);
  parts.push("Continue where the session left off.");
  return parts.join(" ");
}
