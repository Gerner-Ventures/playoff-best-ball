import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * `/` is a static marketing page, so it cannot check the session itself without
 * becoming dynamic again. This is only an optimistic cookie-presence check:
 * /dashboard still validates the session, and a stale cookie ends at /sign-in, not
 * in a loop. Next 16 calls middleware "proxy" (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
