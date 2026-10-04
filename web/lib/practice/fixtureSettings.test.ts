import { describe, expect, it } from "vitest";
import { DEFAULT_FIXTURE_LATENCY_MS, DEFAULT_FIXTURE_REPLAY_MS } from "@/lib/data/fixtureSource";
import { parseFixtureSettings } from "@/lib/practice/fixtureSettings";

const p = (q: string) => parseFixtureSettings(new URLSearchParams(q));

describe("parseFixtureSettings", () => {
  it("defaults", () => {
    expect(p("")).toEqual({
      latencyMs: DEFAULT_FIXTURE_LATENCY_MS,
      replayMs: DEFAULT_FIXTURE_REPLAY_MS,
      failReview: false,
      failCommit: false,
      failOffRecord: false,
      failPause: false,
      failStop: false,
      failRevoke: false,
      failDelete: false,
    });
  });
  it("reads latency and failure, clamped", () => {
    expect(p("fixture_latency=4000&fixture_fail=commit")).toMatchObject({ latencyMs: 4000, failReview: false, failCommit: true });
    expect(p("fixture_latency=-5").latencyMs).toBe(0);
    expect(p("fixture_latency=999999").latencyMs).toBe(30000);
    expect(p("fixture_latency=abc").latencyMs).toBe(DEFAULT_FIXTURE_LATENCY_MS);
    expect(p("fixture_fail=review").failReview).toBe(true);
  });
  it("reads the expert replay interval and expert failures (Sprint 3)", () => {
    expect(p("fixture_replay_ms=300").replayMs).toBe(300);
    expect(p("fixture_replay_ms=1").replayMs).toBe(50);
    expect(p("fixture_fail=offrecord").failOffRecord).toBe(true);
    expect(p("fixture_fail=pause").failPause).toBe(true);
    expect(p("fixture_fail=stop").failStop).toBe(true);
  });
  it("reads trust-control failures (Sprint 4)", () => {
    expect(p("fixture_fail=revoke").failRevoke).toBe(true);
    expect(p("fixture_fail=delete").failDelete).toBe(true);
    expect(p("fixture_fail=delete").failRevoke).toBe(false);
  });
});
