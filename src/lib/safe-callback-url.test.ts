import { describe, it, expect } from "vitest";
import { safeCallbackURL } from "./safe-callback-url";

describe("safeCallbackURL", () => {
  it("returns /dashboard for undefined", () => {
    expect(safeCallbackURL(undefined)).toBe("/dashboard");
  });

  it("passes through a safe relative path unchanged", () => {
    expect(safeCallbackURL("/leagues/x")).toBe("/leagues/x");
  });

  it("blocks a protocol-relative URL (//evil.com)", () => {
    expect(safeCallbackURL("//evil.com")).toBe("/dashboard");
  });

  it("blocks an absolute URL (https://evil.com)", () => {
    expect(safeCallbackURL("https://evil.com")).toBe("/dashboard");
  });
});
