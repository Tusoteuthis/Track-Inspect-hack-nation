// Pure state for the learner's screen share. Only frames acknowledged by the
// data source count as sent, so "last frame" never claims an unsent capture.
export type CaptureStatus = "unsupported" | "idle" | "requesting" | "active" | "denied" | "stopped" | "error";

export type CaptureState = {
  status: CaptureStatus;
  frames_sent: number;
  last_frame_at_utc: string | null;
  frame_error: string | null;
  error: string | null;
};

export type CaptureEvent =
  | { type: "MARK_UNSUPPORTED" }
  | { type: "START" }
  | { type: "GRANTED" }
  | { type: "DENIED" }
  | { type: "FAILED"; error: string }
  | { type: "ENDED" }
  | { type: "FRAME_SENT"; at_utc: string }
  | { type: "FRAME_FAILED"; error: string };

export function initialCaptureState(supported: boolean): CaptureState {
  return {
    status: supported ? "idle" : "unsupported",
    frames_sent: 0,
    last_frame_at_utc: null,
    frame_error: null,
    error: null,
  };
}

export function screenCapture(state: CaptureState, event: CaptureEvent): CaptureState {
  if (state.status === "unsupported") return state;
  switch (event.type) {
    case "MARK_UNSUPPORTED":
      // Detected after mount (SSR cannot know), so the first render matches the server.
      return { ...initialCaptureState(false) };
    case "START":
      if (state.status === "requesting" || state.status === "active") return state;
      return { ...state, status: "requesting", error: null, frame_error: null };
    case "GRANTED":
      return state.status === "requesting" ? { ...state, status: "active" } : state;
    case "DENIED":
      return state.status === "requesting" ? { ...state, status: "denied" } : state;
    case "FAILED":
      return state.status === "requesting" ? { ...state, status: "error", error: event.error } : state;
    case "ENDED":
      return state.status === "active" || state.status === "requesting" ? { ...state, status: "stopped" } : state;
    case "FRAME_SENT":
      if (state.status !== "active") return state;
      return { ...state, frames_sent: state.frames_sent + 1, last_frame_at_utc: event.at_utc, frame_error: null };
    case "FRAME_FAILED":
      return state.status === "active" ? { ...state, frame_error: event.error } : state;
  }
}
