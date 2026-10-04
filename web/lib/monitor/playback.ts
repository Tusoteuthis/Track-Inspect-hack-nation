// Playback logic for the monitor's inspection player, kept pure so it can be
// tested without a <video>. The component feeds it media ticks and key
// commands and applies the returned effect to the element.
//
// Holds: while playing, crossing a hold time freezes the video exactly there so
// the expert can point at a still picture. A hold is not re-triggered by the
// resume that leaves it (the floor), only after seeking back before it.

export type PlaybackStatus = "start" | "playing" | "paused" | "held" | "ended" | "error";

export type PlaybackState = {
  status: PlaybackStatus;
  /** Media time: position in the case video. Never session time, never a signal-axis position. */
  time_ms: number;
  /** 0-based index into the holds while status === "held". */
  hold_index: number | null;
  auto_holds: boolean;
  /** Holds at or before this time are ignored until the playhead goes back before it. */
  floor_ms: number;
  error?: string;
};

export type MonitorCommand =
  | "play"
  | "previous_hold"
  | "seek_back"
  | "seek_forward"
  | "restart"
  | "toggle_auto_holds";

export type PlaybackAction =
  | { type: "tick"; time_ms: number }
  | { type: "command"; command: MonitorCommand }
  | { type: "ended" }
  | { type: "error"; message: string };

export type PlaybackEffect = { kind: "play" } | { kind: "pause_at"; time_ms: number } | { kind: "seek"; time_ms: number };

export type Step = { state: PlaybackState; effect: PlaybackEffect | null };

type Hold = { at_ms: number };

export const SEEK_STEP_MS = 1000;
/** Pressing "previous hold" this close after a hold goes to the one before it. */
const PREVIOUS_HOLD_SLACK_MS = 500;

export const initialPlayback = (autoHolds = true): PlaybackState => ({
  status: "start",
  time_ms: 0,
  hold_index: null,
  auto_holds: autoHolds,
  floor_ms: -1,
});

const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);

export function step(state: PlaybackState, action: PlaybackAction, holds: readonly Hold[], durationMs: number): Step {
  const same: Step = { state, effect: null };
  if (state.status === "error") return same;

  switch (action.type) {
    case "error":
      return { state: { ...state, status: "error", error: action.message }, effect: null };

    case "ended":
      return { state: { ...state, status: "ended", time_ms: durationMs, hold_index: null }, effect: null };

    case "tick": {
      if (state.status !== "playing") return { state: { ...state, time_ms: action.time_ms }, effect: null };
      if (state.auto_holds) {
        const index = holds.findIndex(
          h => h.at_ms > state.floor_ms && state.time_ms < h.at_ms && h.at_ms <= action.time_ms
        );
        if (index >= 0) {
          const at = holds[index].at_ms;
          return {
            state: { ...state, status: "held", time_ms: at, hold_index: index },
            effect: { kind: "pause_at", time_ms: at },
          };
        }
      }
      return { state: { ...state, time_ms: action.time_ms }, effect: null };
    }

    case "command":
      return command(state, action.command, holds, durationMs);
  }
}

function command(state: PlaybackState, cmd: MonitorCommand, holds: readonly Hold[], durationMs: number): Step {
  switch (cmd) {
    case "play":
      if (state.status === "ended") return { state, effect: null };
      if (state.status === "playing")
        return { state: { ...state, status: "paused" }, effect: { kind: "pause_at", time_ms: state.time_ms } };
      return {
        state: {
          ...state,
          status: "playing",
          hold_index: null,
          // Leaving a hold: don't stop at it again just because the video reports a frame earlier.
          floor_ms: state.status === "held" ? state.time_ms : state.floor_ms,
        },
        effect: { kind: "play" },
      };

    case "previous_hold": {
      const before = holds.filter(h => h.at_ms < state.time_ms - PREVIOUS_HOLD_SLACK_MS);
      if (before.length === 0) return restart(state);
      const index = holds.indexOf(before[before.length - 1]);
      const at = holds[index].at_ms;
      return {
        state: { ...state, status: "held", time_ms: at, hold_index: index, floor_ms: -1 },
        effect: { kind: "pause_at", time_ms: at },
      };
    }

    case "seek_back":
    case "seek_forward": {
      const delta = cmd === "seek_back" ? -SEEK_STEP_MS : SEEK_STEP_MS;
      const time = clamp(state.time_ms + delta, durationMs);
      const status: PlaybackStatus =
        state.status === "playing" ? "playing" : state.status === "start" && time === 0 ? "start" : "paused";
      return {
        state: {
          ...state,
          status,
          time_ms: time,
          hold_index: null,
          floor_ms: delta < 0 ? -1 : state.floor_ms,
        },
        effect: { kind: "seek", time_ms: time },
      };
    }

    case "restart":
      return restart(state);

    case "toggle_auto_holds":
      return { state: { ...state, auto_holds: !state.auto_holds }, effect: null };
  }
}

const restart = (state: PlaybackState): Step => ({
  state: { ...initialPlayback(state.auto_holds) },
  effect: { kind: "pause_at", time_ms: 0 },
});

export type KeyInput = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/** Keys a presentation clicker sends (PageDown/PageUp) plus single keyboard keys. */
export function keyToCommand(input: KeyInput): MonitorCommand | "exit" | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  switch (input.key) {
    case " ":
    case "Enter":
    case "PageDown":
      return "play";
    case "PageUp":
      return "previous_hold";
    case "ArrowLeft":
      return "seek_back";
    case "ArrowRight":
      return "seek_forward";
    case "r":
    case "R":
      return "restart";
    case "h":
    case "H":
      return "toggle_auto_holds";
    case "Escape":
      return "exit";
    default:
      return null;
  }
}
