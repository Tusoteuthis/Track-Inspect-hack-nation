// Fixture-only URL settings for /practice: ?fixture_latency=<ms>&fixture_fail=review|commit
import { DEFAULT_FIXTURE_LATENCY_MS, type FixtureSourceOptions } from "@/lib/data/fixtureSource";

export type FixtureSettings = Required<FixtureSourceOptions>;

const MAX_LATENCY_MS = 30_000;

export function parseFixtureSettings(params: { get(name: string): string | null }): FixtureSettings {
  const raw = Number(params.get("fixture_latency"));
  const latencyMs =
    params.get("fixture_latency") !== null && Number.isFinite(raw)
      ? Math.min(MAX_LATENCY_MS, Math.max(0, Math.round(raw)))
      : DEFAULT_FIXTURE_LATENCY_MS;
  const fail = params.get("fixture_fail");
  return { latencyMs, failReview: fail === "review", failCommit: fail === "commit" };
}
