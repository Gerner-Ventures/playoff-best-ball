import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPasswordAuthAllowed } from "@/lib/demo-mode";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth.handler);

// Better Auth decides `emailAndPassword.enabled` at module init, so it cannot await
// the database sentinel. That leaves the config able to check only the environment.
// This wrapper adds the second half of the gate: the password endpoints are MOUNTED
// when the env attests demo mode, but only REACHABLE when the database also says so.
const PASSWORD_PATHS = ["/sign-up/email", "/sign-in/email"];

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
