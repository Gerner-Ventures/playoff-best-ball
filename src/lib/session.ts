import { headers } from "next/headers";
import { auth } from "./auth";

/** Returns the signed-in user or null. Server components / route handlers only. */
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
