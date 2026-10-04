import { ACCESS_COOKIE, accessCookieValue, configuredAccessToken, safeEqual, sha256Hex } from "@/lib/backend/access";
import { ApiError } from "@/lib/backend/errors";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/access?token=…[&next=/path]` — for browsers on the demo LAN: sets the same-site access
 * cookie (the token's hash, HttpOnly) and redirects to `next` (relative paths only) or answers 200.
 */
export async function GET(request: Request): Promise<Response> {
  return handleRoute({ component: "access", op: "grant" }, async () => {
    const token = configuredAccessToken();
    if (token === null) return Response.json({ ok: true, access_token_required: false });
    const url = new URL(request.url);
    const given = url.searchParams.get("token") ?? "";
    if (!safeEqual(await sha256Hex(given), await sha256Hex(token))) throw new ApiError("unauthorized", "Wrong access token.");
    const cookie = `${ACCESS_COOKIE}=${await accessCookieValue(token)}; Path=/; HttpOnly; SameSite=Strict`;
    const next = url.searchParams.get("next");
    if (next && /^\/(?!\/)[\w\-./?=&%]*$/.test(next)) {
      return new Response(null, { status: 303, headers: { Location: next, "Set-Cookie": cookie } });
    }
    return Response.json({ ok: true, access_token_required: true }, { headers: { "Set-Cookie": cookie } });
  });
}
