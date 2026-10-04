// User-facing words for the companion. Every status pairs an icon with text,
// so nothing relies on colour alone.
import type { AgentState } from "@/lib/ui/agentState";
import type { ConnectionState, MappingStatus, RecordingState } from "@/lib/ui/contracts";

export type Copy = { icon: string; text: string };

export const RECORDING_COPY: Record<RecordingState, Copy> = {
  on_record: { icon: "●", text: "On record" },
  off_record: { icon: "⊘", text: "OFF RECORD" },
  off_record_pending: { icon: "⏳", text: "Going off record… waiting for confirmation" },
  on_record_pending: { icon: "⏳", text: "Going back on record… waiting for confirmation" },
};

export const AGENT_COPY: Record<AgentState, Copy> = {
  listening: { icon: "◉", text: "Apprentice is listening" },
  speaking: { icon: "♪", text: "Apprentice is speaking" },
  waiting: { icon: "⏳", text: "Waiting for the apprentice to connect…" },
  disconnected: { icon: "○", text: "Apprentice not connected" },
};

export const CONNECTION_COPY: Record<ConnectionState, Copy> = {
  connected: { icon: "●", text: "Connected" },
  disconnected: { icon: "○", text: "Disconnected" },
  reconnecting: { icon: "⏳", text: "Reconnecting…" },
  unknown: { icon: "?", text: "Unknown" },
};

export const MAPPING_COPY: Record<MappingStatus, string> = {
  resolved: "Region identified",
  ambiguous: "Ambiguous region",
  unresolved: "Region not identified",
};

/** Shown under the trace when the latest region is ambiguous (replaces the viewer's generic notice). */
export const AMBIGUOUS_NOTICE = "Ambiguous: the apprentice will ask you to clarify";
export const UNRESOLVED_NOTICE = "Region not identified: no highlight";

/** Session time is recording time since the start; it is never a position on the trace. */
export function formatSessionTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
