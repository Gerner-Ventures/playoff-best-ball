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
});
