import { describe, expect, it } from "vitest";
import { initialPlayback, keyToCommand, step, type PlaybackState } from "./playback";

const HOLDS = [{ at_ms: 10_600 }, { at_ms: 12_400 }, { at_ms: 15_000 }, { at_ms: 18_000 }];
const DURATION = 22_773;
const run = (state: PlaybackState, ...actions: Parameters<typeof step>[1][]) =>
  actions.reduce(
    (acc, action) => step(acc.state, action, HOLDS, DURATION),
    { state, effect: null } as ReturnType<typeof step>
  );

describe("playback", () => {
  it("starts paused at 0 and plays on the first command", () => {
    const start = initialPlayback();
    expect(start).toMatchObject({ status: "start", time_ms: 0, hold_index: null, auto_holds: true });
    const { state, effect } = step(start, { type: "command", command: "play" }, HOLDS, DURATION);
    expect(state.status).toBe("playing");
    expect(effect).toEqual({ kind: "play" });
  });

  it("holds exactly at a hold time when a tick crosses it", () => {
    const { state, effect } = run(
      initialPlayback(),
      { type: "command", command: "play" },
      { type: "tick", time_ms: 10_400 },
      { type: "tick", time_ms: 10_650 }
    );
    expect(state).toMatchObject({ status: "held", time_ms: 10_600, hold_index: 0 });
    expect(effect).toEqual({ kind: "pause_at", time_ms: 10_600 });
  });

  it("holds on the first crossed hold when one tick jumps over several", () => {
    const { state } = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 13_000 });
    expect(state).toMatchObject({ status: "held", hold_index: 0, time_ms: 10_600 });
  });

  it("does not hold when auto-holds are off", () => {
    const { state } = run(
      initialPlayback(),
      { type: "command", command: "toggle_auto_holds" },
      { type: "command", command: "play" },
      { type: "tick", time_ms: 13_000 }
    );
    expect(state).toMatchObject({ status: "playing", time_ms: 13_000, auto_holds: false });
  });

  it("resumes from a hold without re-triggering it, even if the video reports a slightly earlier time", () => {
    const held = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 10_700 }).state;
    const { state, effect } = run(
      held,
      { type: "command", command: "play" },
      { type: "tick", time_ms: 10_590 },
      { type: "tick", time_ms: 10_700 }
    );
    expect(state).toMatchObject({ status: "playing", time_ms: 10_700, hold_index: null });
    expect(effect).toBeNull();
    const next = run(state, { type: "tick", time_ms: 12_500 }).state;
    expect(next).toMatchObject({ status: "held", hold_index: 1, time_ms: 12_400 });
  });

  it("pauses and resumes manually while playing", () => {
    const playing = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 3_000 }).state;
    const paused = step(playing, { type: "command", command: "play" }, HOLDS, DURATION);
    expect(paused.state.status).toBe("paused");
    expect(paused.effect).toEqual({ kind: "pause_at", time_ms: 3_000 });
    expect(step(paused.state, { type: "command", command: "play" }, HOLDS, DURATION).effect).toEqual({ kind: "play" });
  });

  it("goes back to the previous hold and holds there", () => {
    const atHold2 = run(
      initialPlayback(),
      { type: "command", command: "play" },
      { type: "tick", time_ms: 10_700 },
      { type: "command", command: "play" },
      { type: "tick", time_ms: 12_450 }
    ).state;
    expect(atHold2.hold_index).toBe(1);
    const { state, effect } = step(atHold2, { type: "command", command: "previous_hold" }, HOLDS, DURATION);
    expect(state).toMatchObject({ status: "held", hold_index: 0, time_ms: 10_600 });
    expect(effect).toEqual({ kind: "pause_at", time_ms: 10_600 });
  });

  it("returns to the start state when there is no earlier hold", () => {
    const playing = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 5_000 }).state;
    const { state, effect } = step(playing, { type: "command", command: "previous_hold" }, HOLDS, DURATION);
    expect(state).toMatchObject({ status: "start", time_ms: 0, hold_index: null });
    expect(effect).toEqual({ kind: "pause_at", time_ms: 0 });
  });

  it("seeks by one second, clamped, without triggering holds", () => {
    const playing = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 10_000 }).state;
    const fwd = step(playing, { type: "command", command: "seek_forward" }, HOLDS, DURATION);
    expect(fwd.state).toMatchObject({ status: "playing", time_ms: 11_000 });
    expect(fwd.effect).toEqual({ kind: "seek", time_ms: 11_000 });
    expect(step(fwd.state, { type: "tick", time_ms: 11_100 }, HOLDS, DURATION).state.status).toBe("playing");
    const back = step(initialPlayback(), { type: "command", command: "seek_back" }, HOLDS, DURATION);
    expect(back.state.time_ms).toBe(0);
  });

  it("re-arms a hold after seeking back before it", () => {
    const held = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 10_700 }).state;
    const resumed = run(held, { type: "command", command: "play" }, { type: "tick", time_ms: 10_900 }).state;
    const back = run(resumed, { type: "command", command: "seek_back" }).state; // 9_900
    const { state } = run(back, { type: "tick", time_ms: 10_650 });
    expect(state).toMatchObject({ status: "held", hold_index: 0 });
  });

  it("leaves a hold as paused when seeking from it", () => {
    const held = run(initialPlayback(), { type: "command", command: "play" }, { type: "tick", time_ms: 10_700 }).state;
    const { state } = step(held, { type: "command", command: "seek_forward" }, HOLDS, DURATION);
    expect(state).toMatchObject({ status: "paused", hold_index: null, time_ms: 11_600 });
  });

  it("ends, ignores play at the end, and restarts", () => {
    const ended = run(initialPlayback(), { type: "command", command: "play" }, { type: "ended" }).state;
    expect(ended).toMatchObject({ status: "ended", time_ms: DURATION });
    expect(step(ended, { type: "command", command: "play" }, HOLDS, DURATION)).toEqual({ state: ended, effect: null });
    const { state, effect } = step(ended, { type: "command", command: "restart" }, HOLDS, DURATION);
    expect(state).toMatchObject({ status: "start", time_ms: 0, auto_holds: true });
    expect(effect).toEqual({ kind: "pause_at", time_ms: 0 });
  });

  it("enters the error state and ignores commands there", () => {
    const err = step(initialPlayback(), { type: "error", message: "decode failed" }, HOLDS, DURATION).state;
    expect(err).toMatchObject({ status: "error", error: "decode failed" });
    expect(step(err, { type: "command", command: "play" }, HOLDS, DURATION).effect).toBeNull();
  });
});

describe("keyToCommand", () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    keyToCommand({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it("maps presentation-clicker and keyboard keys", () => {
    expect(key(" ")).toBe("play");
    expect(key("Enter")).toBe("play");
    expect(key("PageDown")).toBe("play");
    expect(key("PageUp")).toBe("previous_hold");
    expect(key("ArrowLeft")).toBe("seek_back");
    expect(key("ArrowRight")).toBe("seek_forward");
    expect(key("r")).toBe("restart");
    expect(key("R")).toBe("restart");
    expect(key("h")).toBe("toggle_auto_holds");
    expect(key("Escape")).toBe("exit");
  });

  it("ignores unknown keys and modified keys", () => {
    expect(key("x")).toBeNull();
    expect(key("r", { metaKey: true })).toBeNull();
    expect(key(" ", { ctrlKey: true })).toBeNull();
  });
});
