// better-auth silently falls back to a built-in default secret when
// BETTER_AUTH_SECRET is unset, then throws from inside getSession() on the first
// request. Every page that reads a session 500s, and the build that produced it
// passed. Preview deployments hit exactly that: the var was scoped to the
// production target only, so each PR preview served a generic "Something went
// wrong" on /. Fail at module load instead, naming the variable and the
// environment that tends to be missing it.
//
// Accepts every variable better-auth itself resolves a secret from (1.7:
// BETTER_AUTH_SECRETS, then BETTER_AUTH_SECRET, then AUTH_SECRET), so the guard
// never rejects a configuration better-auth would run with.
export function assertBetterAuthSecret(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== "production") return;
  const candidates = [env.BETTER_AUTH_SECRETS, env.BETTER_AUTH_SECRET, env.AUTH_SECRET];
  if (candidates.some((secret) => secret?.trim())) return;
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` " +
      "and set it for every deployment target that runs a production build — " +
      "preview as well as production.",
  );
}
