import { describe, it, expect } from "vitest";
import { appOrigin, subscriberUrls } from "./site-url";

describe("site urls", () => {
  it("uses BETTER_AUTH_URL without a trailing slash, defaulting to localhost", () => {
    expect(appOrigin({ BETTER_AUTH_URL: "https://playoffbestball.com/" })).toBe("https://playoffbestball.com");
    expect(appOrigin({})).toBe("http://localhost:3000");
  });

  it("builds the three subscriber links with an encoded token", () => {
    const urls = subscriberUrls("https://p.test");
    expect(urls.confirm("a-b_c")).toBe("https://p.test/subscribe/confirm?token=a-b_c");
    expect(urls.unsubscribePage("t")).toBe("https://p.test/unsubscribe?token=t");
    expect(urls.oneClickUnsubscribe("t")).toBe("https://p.test/api/unsubscribe?token=t");
  });
});
