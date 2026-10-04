import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as accessRoute } from "@/app/api/access/route";
import { proxy } from "@/proxy";
import { accessCookieValue, isAllowed, safeEqual } from "./access";
import { useTempDirs } from "./capture-test-helpers";

let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ cleanup } = await useTempDirs("ws6-access-")); // route diag lines go to a temp RUNTIME_DIR
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});

const req = (url: string, headers: Record<string, string> = {}) => new NextRequest(new URL(url, "http://lan.test"), { headers });

describe("isAllowed (pure)", () => {
  const T = "demo-token-123";
  it("everything is open without a token", async () => {
    expect(await isAllowed({ pathname: "/api/sessions", authorization: null, cookie: null }, null)).toBe(true);
  });
  it("with a token: /api/* needs the bearer token or the cookie; health and access stay open; pages are not API", async () => {
    const at = (pathname: string, authorization: string | null = null, cookie: string | null = null) => isAllowed({ pathname, authorization, cookie }, T);
    expect(await at("/api/sessions")).toBe(false);
    expect(await at("/api/sessions", "Bearer wrong")).toBe(false);
    expect(await at("/api/sessions", `Bearer ${T}`)).toBe(true);
    expect(await at("/api/sessions", null, await accessCookieValue(T))).toBe(true);
    expect(await at("/api/sessions", null, T)).toBe(false); // the cookie holds the hash, not the token
    expect(await at("/api/health")).toBe(true);
    expect(await at("/api/access")).toBe(true);
    expect(await at("/practice")).toBe(true);
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("proxy + /api/access", () => {
  it("with the token set, the API rejects requests without it (401 envelope)", async () => {
    vi.stubEnv("BACKEND_ACCESS_TOKEN", "lan-secret");
    const denied = await proxy(req("/api/sessions/ses-1"));
    expect(denied.status).toBe(401);
    expect((await denied.json()).error.code).toBe("unauthorized");
    const allowed = await proxy(req("/api/sessions/ses-1", { authorization: "Bearer lan-secret" }));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/api/health"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("without the token set, the proxy lets everything through", async () => {
    vi.stubEnv("BACKEND_ACCESS_TOKEN", "");
    expect((await proxy(req("/api/sessions"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("/api/access sets an HttpOnly SameSite=Strict cookie with the hash and redirects to a relative next", async () => {
    vi.stubEnv("BACKEND_ACCESS_TOKEN", "lan-secret");
    expect((await accessRoute(new Request("http://lan.test/api/access?token=nope"))).status).toBe(401);
    const ok = await accessRoute(new Request("http://lan.test/api/access?token=lan-secret&next=/practice"));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/practice");
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toContain(`ws6_access=${await accessCookieValue("lan-secret")}`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toContain("lan-secret");
    const external = await accessRoute(new Request("http://lan.test/api/access?token=lan-secret&next=//evil.example"));
    expect(external.status).toBe(200);
    const cookieValue = cookie.split(";")[0].split("=")[1];
    expect((await proxy(req("/api/sessions", { cookie: `ws6_access=${cookieValue}` }))).headers.get("x-middleware-next")).toBe("1");
  });
});
