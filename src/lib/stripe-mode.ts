/**
 * Which Stripe mode production is actually running in.
 *
 * `STRIPE_SECRET_KEY` is stored as a write-only secret in Vercel, so "are we on
 * test or live keys?" is otherwise unanswerable without dashboard access — the
 * blind spot that let live keys sit in the beta unnoticed. The key's own prefix
 * is the authority; nothing else needs to be configured to keep this honest.
 *
 * Lives apart from ./stripe so server components can read the mode without
 * pulling in the Stripe SDK — same reason ./pricing is separate.
 */
export type StripeMode = "test" | "live" | "off" | "unknown";

export function stripeModeFromKey(key: string | undefined): StripeMode {
  if (!key) return "off";
  // Secret (sk_) and restricted (rk_) keys both carry the mode as an infix.
  if (/^[sr]k_test_/.test(key)) return "test";
  if (/^[sr]k_live_/.test(key)) return "live";
  // Never fall through to a mode we cannot prove: an all-clear "test" badge over
  // a key that might be live is worse than admitting we don't know.
  return "unknown";
}
