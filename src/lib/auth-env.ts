// better-auth silently falls back to a built-in default secret when
// BETTER_AUTH_SECRET is unset, then throws from inside getSession() on the first
// request. Every page that reads a session 500s, and nothing in the response
// names the missing variable. Preview deployments hit exactly that: the var was
// scoped to the production target only, so each PR preview served a generic
// "Something went wrong" on /. Fail at module load instead, naming the variable
// and the environment that tends to be missing it.
export function assertBetterAuthSecret(
  secret: string | undefined,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== "production") return;
  if (secret?.trim()) return;
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` " +
      "and set it for every deployment target that runs a production build — " +
      "preview as well as production.",
  );
}
