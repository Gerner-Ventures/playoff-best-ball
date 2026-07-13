import { describe, it, expect } from "vitest";
import { parsePremiumPriceCents, formatPriceUsd } from "./pricing";

describe("parsePremiumPriceCents", () => {
  it("defaults to 2500 when unset or invalid", () => {
    expect(parsePremiumPriceCents(undefined)).toBe(2500);
    expect(parsePremiumPriceCents("")).toBe(2500);
    expect(parsePremiumPriceCents("abc")).toBe(2500);
    expect(parsePremiumPriceCents("25.5")).toBe(2500); // non-integer cents
    expect(parsePremiumPriceCents("50")).toBe(2500); // below sanity floor ($1)
    expect(parsePremiumPriceCents("200000")).toBe(2500); // above sanity ceiling ($1000)
  });

  it("accepts a valid override", () => {
    expect(parsePremiumPriceCents("2000")).toBe(2000);
  });
});

describe("formatPriceUsd", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatPriceUsd(2500)).toBe("$25");
    expect(formatPriceUsd(2050)).toBe("$20.50");
  });
});
