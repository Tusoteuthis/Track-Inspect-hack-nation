/**
 * Demo access boundary (S4). With `BACKEND_ACCESS_TOKEN` set, every `/api/*` route except
 * `/api/health` and `/api/access` needs `Authorization: Bearer <token>` (iPhone, scripts) or the
 * `ws6_access` cookie that `GET /api/access?token=` sets (browsers, incl. EventSource).
 *
 * What it is: one shared secret for a LAN demo. Not per-user auth, no roles, no expiry, no TLS —
 * anyone on the network who sees the token or the cookie has full access. Runtime-agnostic
 * (Web Crypto only), so it also works where the proxy runs.
 */
export const ACCESS_COOKIE = "ws6_access";
const EXEMPT = new Set(["/api/health", "/api/access"]);

export function configuredAccessToken(): string | null {
  const t = process.env.BACKEND_ACCESS_TOKEN?.trim();
  return t ? t : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time for equal lengths; tokens and digests are compared as fixed-length hex. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The cookie holds the token's hash, never the token itself. */
export const accessCookieValue = (token: string) => sha256Hex(`ws6-access:${token}`);

export type AccessInput = { pathname: string; authorization: string | null; cookie: string | null };

export async function isAllowed(input: AccessInput, token: string | null): Promise<boolean> {
  if (token === null) return true;
  if (!input.pathname.startsWith("/api/") || EXEMPT.has(input.pathname)) return true;
  const bearer = /^Bearer\s+(.+)$/i.exec(input.authorization ?? "")?.[1]?.trim();
  if (bearer && safeEqual(await sha256Hex(bearer), await sha256Hex(token))) return true;
  return input.cookie !== null && safeEqual(input.cookie, await accessCookieValue(token));
}

export const unauthorizedBody = {
  error: { code: "unauthorized", message: "This backend requires the demo access token (Authorization: Bearer … or /api/access?token=…)." },
} as const;
