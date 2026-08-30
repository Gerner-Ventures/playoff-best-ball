import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPasswordAuthAllowed } from "@/lib/demo-mode";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth.handler);

// Better Auth decides `emailAndPassword.enabled` at module init, so it cannot await
// the database sentinel. That leaves the config able to check only the environment.
// This wrapper adds the second half of the gate: the password endpoints are MOUNTED
// when the env attests demo mode, but only REACHABLE when the database also says so.
//
// The whole password family, not just the two obvious entry points: Better Auth
// mounts all of these off `emailAndPassword.enabled`. Between the env attesting
// demo mode and `npm run demo:seed` writing the sentinel, anything missing here is
// reachable while the stated invariant says password auth is off. /change-*,
// /delete-user and /reset-password also need a session or a token, so they are
// narrower than sign-in — but "needs a session" is not the gate this file exists
// to enforce.
//
// Enumerated from better-auth/dist/api/routes/*.mjs. Being a denylist, a password
// route added upstream is uncovered until listed here — worth re-checking on a
// better-auth upgrade.
const PASSWORD_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
  "/change-email",
  "/delete-user",
];

export const GET = handlers.GET;

export async function POST(req: Request) {
  const { pathname } = new URL(req.url);
  if (PASSWORD_PATHS.some((p) => pathname.endsWith(p))) {
    if (!(await isPasswordAuthAllowed(db))) {
      // 404 rather than 403, matching the /admin convention: a probe should not be
      // able to tell "gate closed" from "endpoint does not exist".
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
  }
  return handlers.POST(req);
}
