// Per-screen switch between fixture data and the WS6 backend, driven by public env
// vars so a demo can go live one screen at a time.
import { createApiSource } from "@/lib/data/apiSource";
import type { DataSource } from "@/lib/data/source";

export type Screen = "expert" | "review" | "map" | "practice" | "summary";
export const SCREENS: readonly Screen[] = ["expert", "review", "map", "practice", "summary"];

const isScreen = (v: string): v is Screen => (SCREENS as readonly string[]).includes(v);

/** NEXT_PUBLIC_WS7_LIVE_SCREENS="expert,map" → Set of live screens; "all" → every screen; unknown names ignored; empty/undefined → none. */
export function parseLiveScreens(value: string | undefined): ReadonlySet<Screen> {
  const names = (value ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (names.includes("all")) return new Set(SCREENS);
  return new Set(names.filter(isScreen));
}

export function isLiveScreen(screen: Screen): boolean {
  // Referenced literally so Next inlines it into the client bundle.
  return parseLiveScreens(process.env.NEXT_PUBLIC_WS7_LIVE_SCREENS).has(screen);
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WS6_BASE_URL ?? "").replace(/\/+$/, "");
}

let shared: DataSource | null = null;

/** One api source per tab, so every live screen shares its connection state. */
export function getApiSource(): DataSource {
  shared ??= createApiSource({ baseUrl: apiBaseUrl() });
  return shared;
}
