import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, configuredAccessToken, isAllowed, unauthorizedBody } from "@/lib/backend/access";

/** Demo access boundary for `/api/*` (see `lib/backend/access.ts`). A no-op without BACKEND_ACCESS_TOKEN. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const allowed = await isAllowed(
    {
      pathname: request.nextUrl.pathname,
      authorization: request.headers.get("authorization"),
      cookie: request.cookies.get(ACCESS_COOKIE)?.value ?? null,
    },
    configuredAccessToken(),
  );
  return allowed ? NextResponse.next() : NextResponse.json(unauthorizedBody, { status: 401 });
}

export const config = { matcher: "/api/:path*" };
