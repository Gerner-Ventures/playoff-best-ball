/**
 * Strips `token` from analytics URLs before they leave the browser.
 *
 * Confirm and unsubscribe links carry a secret token in the query string, and
 * PostHog autocaptures pageview URLs ($current_url, $referrer) — including into
 * $set_once ($initial_current_url, $initial_referrer, and the session-entry
 * $current_url/$referrer sent for every identified user), nested event payloads
 * (e.g. $web_vitals_*_event.$current_url), and $heatmap_data, which is keyed BY
 * url rather than carrying one as a value. An unsubscribe token can also
 * resubscribe, so letting any of these reach the analytics store would hand
 * anyone with dashboard access a way to unsubscribe or resubscribe a stranger.
 *
 * No imports: this runs inside `before_send`, on every captured event, so it
 * stays a small, dependency-free, easily auditable transform.
 */

/**
 * Removes every `token` query parameter from a URL-like string (absolute URL or
 * a path-plus-query string) — including repeats — keeping every other part
 * (other params, their order, the hash) intact and never leaving a dangling `?`
 * or `&`. Strings without `token=` are returned unchanged. Keys like `xtoken=`,
 * `tokens=` or `token_type=` are untouched: only a param whose key is exactly
 * `token` is removed.
 */
export function scrubTokenParam(value: string): string {
  if (!value.includes("token=")) return value;

  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);

  const queryIndex = beforeHash.indexOf("?");
  if (queryIndex === -1) return value; // "token=" isn't inside a query string at all — nothing to strip.

  const base = beforeHash.slice(0, queryIndex);
  const query = beforeHash.slice(queryIndex + 1);

  const kept = query.split("&").filter((part) => part !== "" && !part.startsWith("token="));
  const newQuery = kept.length > 0 ? `?${kept.join("&")}` : "";

  return `${base}${newQuery}${hash}`;
}

/** A plain `{}`-style object — excludes arrays, `Date`, `Map`, class instances, etc. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively copies `value`, passing every string it finds — values, and plain
 * object keys — that contains `token=` through {@link scrubTokenParam}. Anything
 * else (numbers, booleans, `null`, `Date`s, and strings without `token=`) is kept
 * as-is. Always returns a copy; never mutates its input.
 */
function deepScrub(value: unknown): unknown {
  if (typeof value === "string") return value.includes("token=") ? scrubTokenParam(value) : value;
  if (Array.isArray(value)) return value.map(deepScrub);
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const scrubbedKey = key.includes("token=") ? scrubTokenParam(key) : key;
      result[scrubbedKey] = deepScrub(entry);
    }
    return result;
  }
  return value;
}

interface ScrubbableEvent {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/**
 * Deep-scrubs `properties`, `$set` and `$set_once` (PostHog's `CaptureResult`
 * carries URLs in all three — see the module doc). `null` passes through
 * untouched. Never mutates the event it was given, or anything inside it; every
 * touched object or array comes back as a fresh copy.
 */
export function scrubTokens<T extends ScrubbableEvent | null>(event: T): T {
  if (!event) return event;

  const next = { ...event } as T;
  const mutable = next as unknown as ScrubbableEvent;
  if (event.properties) mutable.properties = deepScrub(event.properties) as Record<string, unknown>;
  if (event.$set) mutable.$set = deepScrub(event.$set) as Record<string, unknown>;
  if (event.$set_once) mutable.$set_once = deepScrub(event.$set_once) as Record<string, unknown>;

  return next;
}
