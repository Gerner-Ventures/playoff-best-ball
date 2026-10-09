import { describe, expect, it } from "vitest";
import { scrubTokenParam, scrubTokens } from "./analytics-scrub";

describe("scrubTokenParam", () => {
  it("removes the token when it's the only param on an absolute URL", () => {
    expect(scrubTokenParam("https://news.playoffbestball.com/unsubscribe?token=abc123")).toBe(
      "https://news.playoffbestball.com/unsubscribe",
    );
  });

  it("removes the token when it's first of several params", () => {
    expect(scrubTokenParam("https://x.com/unsubscribe?token=abc123&status=unsubscribed")).toBe(
      "https://x.com/unsubscribe?status=unsubscribed",
    );
  });

  it("removes the token when it's in the middle", () => {
    expect(scrubTokenParam("https://x.com/unsubscribe?a=1&token=abc123&status=unsubscribed")).toBe(
      "https://x.com/unsubscribe?a=1&status=unsubscribed",
    );
  });

  it("removes the token when it's last", () => {
    expect(scrubTokenParam("https://x.com/unsubscribe?status=unsubscribed&token=abc123")).toBe(
      "https://x.com/unsubscribe?status=unsubscribed",
    );
  });

  it("keeps the hash intact", () => {
    expect(scrubTokenParam("https://x.com/unsubscribe?token=abc123#section")).toBe(
      "https://x.com/unsubscribe#section",
    );
  });

  it("works on a relative path-plus-query string", () => {
    expect(scrubTokenParam("/unsubscribe?token=abc&status=unsubscribed")).toBe("/unsubscribe?status=unsubscribed");
  });

  it("returns a string without a token unchanged", () => {
    expect(scrubTokenParam("/unsubscribe?status=unsubscribed")).toBe("/unsubscribe?status=unsubscribed");
  });

  it("removes duplicate token params with no dangling separator", () => {
    expect(scrubTokenParam("https://x.com/u?token=A&token=B")).toBe("https://x.com/u");
  });

  it("removes duplicate token params alongside another param", () => {
    expect(scrubTokenParam("https://x.com/u?a=1&token=A&token=B")).toBe("https://x.com/u?a=1");
  });

  it("removes a trailing token param that leaves a dangling '&'", () => {
    expect(scrubTokenParam("https://x.com/u?token=A&")).toBe("https://x.com/u");
  });

  it("leaves xtoken=, tokens= and token_type= untouched", () => {
    const value = "https://x.com/u?xtoken=abc&tokens=1&token_type=bearer";
    expect(scrubTokenParam(value)).toBe(value);
  });
});

describe("scrubTokens", () => {
  it("scrubs $current_url and $referrer, leaving non-string properties alone", () => {
    const event = {
      properties: {
        $current_url: "https://x.com/unsubscribe?token=abc123&status=unsubscribed",
        $referrer: "https://x.com/subscribe/confirm?token=def456",
        $lib: "web",
        count: 3,
        ok: true,
      },
    };

    const result = scrubTokens(event);

    expect(result.properties.$current_url).toBe("https://x.com/unsubscribe?status=unsubscribed");
    expect(result.properties.$referrer).toBe("https://x.com/subscribe/confirm");
    expect(result.properties.$lib).toBe("web");
    expect(result.properties.count).toBe(3);
    expect(result.properties.ok).toBe(true);
  });

  it("passes null through untouched", () => {
    expect(scrubTokens(null)).toBeNull();
  });

  it("deep-scrubs $set, $set_once and nested event payloads, and keys URLs out of $heatmap_data", () => {
    const event = {
      properties: {
        $web_vitals_LCP_event: {
          $current_url: "https://x.com/pricing?token=lcp-secret",
          value: 1234,
        },
        $heatmap_data: {
          "https://x.com/unsubscribe?token=heatmap-secret": [{ x: 1, y: 2 }],
        },
        token: "phc_project_key",
      },
      $set: {
        $current_url: "https://x.com/subscribe/confirm?token=set-secret",
      },
      $set_once: {
        $initial_current_url: "https://x.com/?token=initial-secret&utm_source=x",
        $initial_referrer: "https://ref.example/?token=initial-ref-secret",
        $current_url: "https://x.com/unsubscribe?token=session-entry-secret",
      },
    };

    const result = scrubTokens(event);

    expect(result.properties.$web_vitals_LCP_event).toEqual({ $current_url: "https://x.com/pricing", value: 1234 });
    expect(Object.keys(result.properties.$heatmap_data as Record<string, unknown>)).toEqual([
      "https://x.com/unsubscribe",
    ]);
    expect((result.properties.$heatmap_data as Record<string, unknown>)["https://x.com/unsubscribe"]).toEqual([
      { x: 1, y: 2 },
    ]);
    expect(result.properties.token).toBe("phc_project_key");

    expect(result.$set!.$current_url).toBe("https://x.com/subscribe/confirm");

    expect(result.$set_once!.$initial_current_url).toBe("https://x.com/?utm_source=x");
    expect(result.$set_once!.$initial_referrer).toBe("https://ref.example/");
    expect(result.$set_once!.$current_url).toBe("https://x.com/unsubscribe");
  });

  it("never mutates the event it was given", () => {
    const original = {
      properties: {
        $current_url: "https://x.com/unsubscribe?token=abc123",
        $heatmap_data: { "https://x.com/u?token=abc": [1, 2, 3] },
      },
      $set_once: { $initial_current_url: "https://x.com/?token=def456" },
    };
    const snapshot = JSON.parse(JSON.stringify(original));

    const result = scrubTokens(original);

    expect(original).toEqual(snapshot);
    expect(result).not.toBe(original);
    expect(result.properties).not.toBe(original.properties);
    expect(result.$set_once).not.toBe(original.$set_once);
  });
});
