// Fixture-only URL settings for /practice and /expert:
// ?fixture_latency=<ms>&fixture_fail=review|commit|offrecord|pause|stop&fixture_replay_ms=<ms>
import {
  DEFAULT_FIXTURE_LATENCY_MS,
  DEFAULT_FIXTURE_REPLAY_MS,
  type FixtureSourceOptions,
} from "@/lib/data/fixtureSource";

export type FixtureSettings = Required<FixtureSourceOptions>;

const MAX_LATENCY_MS = 30_000;
const MIN_REPLAY_MS = 50;

function readMs(params: { get(name: string): string | null }, name: string, fallback: number, min: number) {
  const value = params.get(name);
  const raw = Number(value);
  return value !== null && Number.isFinite(raw) ? Math.min(MAX_LATENCY_MS, Math.max(min, Math.round(raw))) : fallback;
}

export function parseFixtureSettings(params: { get(name: string): string | null }): FixtureSettings {
  const fail = params.get("fixture_fail");
  return {
    latencyMs: readMs(params, "fixture_latency", DEFAULT_FIXTURE_LATENCY_MS, 0),
    replayMs: readMs(params, "fixture_replay_ms", DEFAULT_FIXTURE_REPLAY_MS, MIN_REPLAY_MS),
    failReview: fail === "review",
    failCommit: fail === "commit",
    failOffRecord: fail === "offrecord",
    failPause: fail === "pause",
    failStop: fail === "stop",
  };
}
