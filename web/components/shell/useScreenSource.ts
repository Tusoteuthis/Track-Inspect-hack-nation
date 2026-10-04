"use client";

import { useSearchParams } from "next/navigation";
import { useDataSource } from "@/lib/data/DataSourceProvider";
import { getApiSource, isLiveScreen, type Screen } from "@/lib/data/screenSources";
import type { DataSource } from "@/lib/data/source";

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
 * Session from `?session=`. The fixture session is only a default for fixture
 * sources; a live screen without a session shows its empty state instead.
 */
export function useSessionParam(source: DataSource, fixtureSessionId: string): string | null {
  const fromUrl = useSearchParams().get("session");
  return fromUrl ?? (source.kind === "fixture" ? fixtureSessionId : null);
}
