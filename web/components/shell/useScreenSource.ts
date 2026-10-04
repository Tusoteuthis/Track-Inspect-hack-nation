"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useDataSource } from "@/lib/data/DataSourceProvider";
import { createFixtureSource } from "@/lib/data/fixtureSource";
import { getApiSource, isLiveScreen, type Screen } from "@/lib/data/screenSources";
import type { DataSource } from "@/lib/data/source";
import { parseFixtureSettings } from "@/lib/practice/fixtureSettings";

/**
 * The source for one screen: WS6 when the screen is configured live
 * (NEXT_PUBLIC_WS7_LIVE_SCREENS), otherwise the app's default (fixture) source.
 * Lets a partially available backend drive only the screens it can serve.
 */
export function useScreenSource(screen: Screen): DataSource {
  const base = useDataSource();
  return isLiveScreen(screen) ? getApiSource() : base;
}

/**
 * Fixture mode only: `?fixture_latency=…&fixture_fail=…` give the screen its own
 * fixture source so the human gate can force delays and failures. Without such
 * parameters (or with a live source) the screen keeps its shared source.
 */
export function useFixtureOverrides(source: DataSource): DataSource {
  const query = useSearchParams().toString();
  return useMemo(() => {
    const params = new URLSearchParams(query);
    const wanted = [...params.keys()].some(k => k.startsWith("fixture_"));
    return source.kind === "fixture" && wanted ? createFixtureSource(parseFixtureSettings(params)) : source;
  }, [query, source]);
}

/**
 * Session from `?session=`. The fixture session is only a default for fixture
 * sources; a live screen without a session shows its empty state instead.
 */
export function useSessionParam(source: DataSource, fixtureSessionId: string): string | null {
  const fromUrl = useSearchParams().get("session");
  return fromUrl ?? (source.kind === "fixture" ? fixtureSessionId : null);
}
