import { describe, expect, it } from "vitest";
import { DEMO_HOSTNAMES, resolveDemoMode } from "./demo-mode";

// The gate that lets a PUBLIC deployment accept passwords. Every case that is not
// provably a demo host must come back `fatal` or `not-requested` — never a silent
// "off", because a silent off is indistinguishable from a gate that stopped working.

describe("resolveDemoMode", () => {
  const demoHost = "https://demo.playoffbestball.com";

  describe("opt-in", () => {
    it("is off when DEMO_MODE is unset, whatever else is set", () => {
      expect(resolveDemoMode({ BETTER_AUTH_URL: demoHost })).toEqual({
        enabled: false,
        reason: "not-requested",
      });
    });

    it.each(["0", "true", "yes", "", "1 ", "TRUE"])(
      "is off when DEMO_MODE is %o — only the exact string \"1\" opts in",
      (value) => {
        expect(resolveDemoMode({ DEMO_MODE: value, BETTER_AUTH_URL: demoHost })).toEqual({
          enabled: false,
          reason: "not-requested",
        });
      },
    );

    it("enables on an allowlisted demo host", () => {
      expect(resolveDemoMode({ DEMO_MODE: "1", BETTER_AUTH_URL: demoHost })).toEqual({
        enabled: true,
        reason: "demo-host",
      });
    });

    it("enables on the deployed demo's vercel.app alias", () => {
      const result = resolveDemoMode({
        DEMO_MODE: "1",
        BETTER_AUTH_URL: "https://playoff-best-ball-demo.vercel.app",
      });
      expect(result).toEqual({ enabled: true, reason: "demo-host" });
    });

    it("refuses the PRODUCTION project's vercel.app alias", () => {
      // The two projects' aliases differ by one word. Getting this wrong would
      // open password sign-in on the real app.
      const result = resolveDemoMode({
        DEMO_MODE: "1",
        BETTER_AUTH_URL: "https://playoff-best-ball.vercel.app",
      });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe("fatal");
    });

    it("enables on localhost so the seeder can mint users locally", () => {
      const result = resolveDemoMode({ DEMO_MODE: "1", BETTER_AUTH_URL: "http://localhost:3000" });
      expect(result.enabled).toBe(true);
    });
  });

  describe("host allowlist", () => {
    // The allowlist is compiled in, so adding a host is a reviewed code change
    // rather than an env edit. An unknown host is fatal, never a silent off.
    it.each([
      ["a production-looking apex domain", "https://playoffbestball.com"],
      ["an arbitrary preview deploy", "https://playoff-best-ball-abc123.vercel.app"],
      ["a lookalike host", "https://demo.playoffbestball.com.evil.test"],
      ["a subdomain of an allowed host", "https://x.demo.playoffbestball.com"],
    ])("refuses to boot on %s", (_label, url) => {
      const result = resolveDemoMode({ DEMO_MODE: "1", BETTER_AUTH_URL: url });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe("fatal");
    });

    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["not a URL", "not-a-url"],
    ])("refuses to boot when BETTER_AUTH_URL is %s", (_label, url) => {
      const result = resolveDemoMode({ DEMO_MODE: "1", BETTER_AUTH_URL: url });
      expect(result.reason).toBe("fatal");
    });

    it("matches on host including port, so a stray port is not allowed", () => {
      const result = resolveDemoMode({
        DEMO_MODE: "1",
        BETTER_AUTH_URL: "https://demo.playoffbestball.com:8443",
      });
      expect(result.reason).toBe("fatal");
    });
  });

  describe("production signals", () => {
    // Catches the "someone copied the production env store into the demo project"
    // scenario, which every host-based check would miss if the URL came along too.
    it("refuses to boot when a live Stripe key is present", () => {
      const result = resolveDemoMode({
        DEMO_MODE: "1",
        BETTER_AUTH_URL: demoHost,
        STRIPE_SECRET_KEY: "sk_live_abc123",
      });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe("fatal");
      if (result.reason === "fatal") expect(result.message).toMatch(/live Stripe/i);
    });

    it("allows a test Stripe key", () => {
      const result = resolveDemoMode({
        DEMO_MODE: "1",
        BETTER_AUTH_URL: demoHost,
        STRIPE_SECRET_KEY: "sk_test_abc123",
      });
      expect(result.enabled).toBe(true);
    });

    it("allows a blank Stripe key", () => {
      const result = resolveDemoMode({ DEMO_MODE: "1", BETTER_AUTH_URL: demoHost, STRIPE_SECRET_KEY: "" });
      expect(result.enabled).toBe(true);
    });
  });

  describe("the allowlist itself", () => {
    it("contains no apex production domain", () => {
      // A future edit that adds the real product domain here would silently turn
      // production into a demo. Kept as a standing assertion rather than a comment.
      expect(DEMO_HOSTNAMES).not.toContain("playoffbestball.com");
      expect(DEMO_HOSTNAMES).not.toContain("www.playoffbestball.com");
    });

    it("contains no wildcards — every entry is an exact host match", () => {
      for (const host of DEMO_HOSTNAMES) expect(host).not.toContain("*");
    });
  });
});
