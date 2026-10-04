import { describe, expect, it } from "vitest";
import { DEFAULT_INTERVIEW_CONFIG as C } from "./interview-config";
import { initialSpeech, observeSpeech, quietForMs, settleSpeech } from "./speech";

const idle = { agent_speaking: false };

describe("speech detector", () => {
  it("starts speaking on a VAD score at or above the threshold", () => {
    const r = observeSpeech(initialSpeech(), { kind: "vad", score: C.vad_threshold }, 1000, idle, C);
    expect(r.state.speaking).toBe(true);
    expect(r.transition).toEqual({ speaking: true, at_perf: 1000 });
  });

  it("ignores VAD below the threshold", () => {
    const r = observeSpeech(initialSpeech(), { kind: "vad", score: C.vad_threshold - 0.01 }, 1000, idle, C);
    expect(r.state.speaking).toBe(false);
    expect(r.transition).toBeNull();
  });

  it("treats a tentative transcript as speech", () => {
    const r = observeSpeech(initialSpeech(), { kind: "tentative" }, 500, idle, C);
    expect(r.state.speaking).toBe(true);
  });

  it("uses the local mic level, but not while the agent speaks (echo)", () => {
    const loud = { kind: "mic", level: C.mic_threshold } as const;
    expect(observeSpeech(initialSpeech(), loud, 10, idle, C).state.speaking).toBe(true);
    expect(observeSpeech(initialSpeech(), loud, 10, { agent_speaking: true }, C).state.speaking).toBe(false);
  });

  it("a final line refreshes last activity without starting an interval", () => {
    const r = observeSpeech(initialSpeech(), { kind: "final" }, 2000, idle, C);
    expect(r.state.speaking).toBe(false);
    expect(r.transition).toBeNull();
    expect(r.state.last_activity_perf).toBe(2000);
  });

  it("only one start transition while speech continues", () => {
    let s = observeSpeech(initialSpeech(), { kind: "vad", score: 0.9 }, 100, idle, C).state;
    const r = observeSpeech(s, { kind: "vad", score: 0.9 }, 200, idle, C);
    expect(r.transition).toBeNull();
    s = r.state;
    expect(s.last_activity_perf).toBe(200);
  });

  it("ends after speech_hold_ms of no activity, stamped at the last activity", () => {
    const s = observeSpeech(initialSpeech(), { kind: "vad", score: 0.9 }, 1000, idle, C).state;
    expect(settleSpeech(s, 1000 + C.speech_hold_ms - 1, C).transition).toBeNull();
    const r = settleSpeech(s, 1000 + C.speech_hold_ms, C);
    expect(r.state.speaking).toBe(false);
    expect(r.transition).toEqual({ speaking: false, at_perf: 1000 });
  });

  it("quietForMs is 0 while speaking, infinite before any speech, else time since last activity", () => {
    expect(quietForMs(initialSpeech(), 5000)).toBe(Number.POSITIVE_INFINITY);
    const speaking = observeSpeech(initialSpeech(), { kind: "tentative" }, 1000, idle, C).state;
    expect(quietForMs(speaking, 3000)).toBe(0);
    const ended = settleSpeech(speaking, 1500, C).state;
    expect(quietForMs(ended, 3000)).toBe(2000);
  });
});
