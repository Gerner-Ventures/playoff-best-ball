/**
 * Strips `token` from analytics URLs before they leave the browser.
 *
 * Confirm and unsubscribe links carry a secret token in the query string, and
 * PostHog autocaptures pageview URLs ($current_url, $referrer). An unsubscribe
 * token can also resubscribe, so letting it reach the analytics store would hand
 * anyone with dashboard access a way to unsubscribe or resubscribe a stranger.
 *
 * No imports: this runs inside `before_send`, on every captured event, so it
 * stays a small, dependency-free, easily auditable transform.
 */

/**
 * Removes a `token` query parameter from a URL-like string (absolute URL or a
 * path-plus-query string), keeping every other part — other params, the hash —
 * intact. Strings without `token=` are returned unchanged.
 */
export function scrubTokenParam(value: string): string {
  return value.replace(/([?&])token=[^&#]*(&)?/g, (_match, leading: string, trailing: string | undefined) =>
    trailing ? leading : "",
  );
}

/**
 * Passes every string property containing `token=` through {@link scrubTokenParam}.
 * Non-string properties are left alone. `null` passes through untouched. Never
 * mutates the event or properties object it was given; it returns a shallow copy.
 */
export function scrubTokens<T extends { properties?: Record<string, unknown> } | null>(event: T): T {
  if (!event || !event.properties) return event;

  const properties: Record<string, unknown> = { ...event.properties };
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && value.includes("token=")) {
      properties[key] = scrubTokenParam(value);
    }
  }

  return { ...event, properties } as T;
}
