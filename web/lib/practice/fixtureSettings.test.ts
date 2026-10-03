import { describe, expect, it } from "vitest";
import { DEFAULT_FIXTURE_LATENCY_MS } from "@/lib/data/fixtureSource";
import { parseFixtureSettings } from "@/lib/practice/fixtureSettings";

const p = (q: string) => parseFixtureSettings(new URLSearchParams(q));

describe("parseFixtureSettings", () => {
  it("defaults", () => {
    expect(p("")).toEqual({ latencyMs: DEFAULT_FIXTURE_LATENCY_MS, failReview: false, failCommit: false });
  });
  it("reads latency and failure, clamped", () => {
    expect(p("fixture_latency=4000&fixture_fail=commit")).toEqual({ latencyMs: 4000, failReview: false, failCommit: true });
    expect(p("fixture_latency=-5").latencyMs).toBe(0);
    expect(p("fixture_latency=999999").latencyMs).toBe(30000);
    expect(p("fixture_latency=abc").latencyMs).toBe(DEFAULT_FIXTURE_LATENCY_MS);
    expect(p("fixture_fail=review").failReview).toBe(true);
  });
});
