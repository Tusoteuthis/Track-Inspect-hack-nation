import { afterEach, describe, expect, it, vi } from "vitest";
import { SCREENS, apiBaseUrl, getApiSource, isLiveScreen, parseLiveScreens } from "@/lib/data/screenSources";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseLiveScreens", () => {
  it("parses a comma list and ignores unknown names", () => {
    expect([...parseLiveScreens(" expert, map ,bogus")].sort()).toEqual(["expert", "map"]);
  });

  it("treats 'all' as every screen", () => {
    expect([...parseLiveScreens("all")].sort()).toEqual([...SCREENS].sort());
  });

  it("is empty for empty or missing values", () => {
    expect(parseLiveScreens(undefined).size).toBe(0);
    expect(parseLiveScreens("").size).toBe(0);
    expect(parseLiveScreens(" , ").size).toBe(0);
  });
});

describe("isLiveScreen", () => {
  it("reads NEXT_PUBLIC_WS7_LIVE_SCREENS", () => {
    vi.stubEnv("NEXT_PUBLIC_WS7_LIVE_SCREENS", "practice");
    expect(isLiveScreen("practice")).toBe(true);
    expect(isLiveScreen("expert")).toBe(false);
  });

  it("is fixture-only by default", () => {
    vi.stubEnv("NEXT_PUBLIC_WS7_LIVE_SCREENS", "");
    expect(SCREENS.some(isLiveScreen)).toBe(false);
  });
});

describe("apiBaseUrl", () => {
  it("strips trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_WS6_BASE_URL", "http://laptop:3006/");
    expect(apiBaseUrl()).toBe("http://laptop:3006");
  });

  it("defaults to same origin", () => {
    vi.stubEnv("NEXT_PUBLIC_WS6_BASE_URL", "");
    expect(apiBaseUrl()).toBe("");
  });
});

describe("getApiSource", () => {
  it("returns one shared api source", () => {
    const a = getApiSource();
    expect(a.kind).toBe("api");
    expect(getApiSource()).toBe(a);
  });
});
