// Same-browser link between the monitor window (/expert/display) and the
// companion (/expert). The monitor reports playback; the companion reports the
// session's recording state. Messages are validated on receipt and anything
// unknown is dropped. Without BroadcastChannel (SSR, old browsers) it is a no-op.

export const MONITOR_CHANNEL = "nspct-monitor";

export type MonitorStatus = "start" | "playing" | "paused" | "held" | "ended" | "error";
export type SessionRecording = "recording" | "off_record" | "paused" | "none";

export type MonitorStateMessage = {
  type: "monitor_state";
  case_id: string;
  status: MonitorStatus;
  /** Media time: position in the case video. */
  media_time_ms: number;
  duration_ms: number;
  hold_id: string | null;
  /** 1-based, set while held. */
  hold_index: number | null;
  hold_count: number;
  auto_holds: boolean;
};
export type SessionStateMessage = { type: "session_state"; recording: SessionRecording };
export type HelloMessage = { type: "hello"; from: "monitor" | "companion" };
export type ByeMessage = { type: "bye"; from: "monitor" };
export type MonitorMessage = MonitorStateMessage | SessionStateMessage | HelloMessage | ByeMessage;

const STATUSES: readonly MonitorStatus[] = ["start", "playing", "paused", "held", "ended", "error"];
const RECORDINGS: readonly SessionRecording[] = ["recording", "off_record", "paused", "none"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export function parseMonitorMessage(input: unknown): MonitorMessage | null {
  if (!isRecord(input)) return null;
  switch (input.type) {
    case "monitor_state": {
      const ok =
        typeof input.case_id === "string" &&
        input.case_id.length > 0 &&
        STATUSES.includes(input.status as MonitorStatus) &&
        isTime(input.media_time_ms) &&
        isTime(input.duration_ms) &&
        (input.hold_id === null || (typeof input.hold_id === "string" && input.hold_id.length > 0)) &&
        (input.hold_index === null || (isCount(input.hold_index) && (input.hold_index as number) >= 1)) &&
        isCount(input.hold_count) &&
        typeof input.auto_holds === "boolean";
      return ok ? (input as MonitorStateMessage) : null;
    }
    case "session_state":
      return RECORDINGS.includes(input.recording as SessionRecording) ? (input as SessionStateMessage) : null;
    case "hello":
      return input.from === "monitor" || input.from === "companion" ? (input as HelloMessage) : null;
    case "bye":
      return input.from === "monitor" ? (input as ByeMessage) : null;
    default:
      return null;
  }
}

export type MonitorLink = { post(message: MonitorMessage): void; close(): void };

export function openMonitorChannel(onMessage: (message: MonitorMessage) => void): MonitorLink {
  if (typeof BroadcastChannel === "undefined") return { post() {}, close() {} };
  const channel = new BroadcastChannel(MONITOR_CHANNEL);
  channel.onmessage = (e: MessageEvent) => {
    const message = parseMonitorMessage(e.data);
    if (message) onMessage(message);
  };
  let open = true;
  return {
    post(message) {
      if (open) channel.postMessage(message);
    },
    close() {
      open = false;
      channel.close();
    },
  };
}
