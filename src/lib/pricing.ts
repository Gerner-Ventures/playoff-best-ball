const DEFAULT_PREMIUM_PRICE_CENTS = 2500;

/** Beta decision (2026-07-13): price is env-driven; the final number is chosen at launch. */
export function parsePremiumPriceCents(raw: string | undefined): number {
  if (!raw) return DEFAULT_PREMIUM_PRICE_CENTS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 100 || n > 100_000) {
    console.warn(`[pricing] ignoring invalid PREMIUM_PRICE_CENTS=${JSON.stringify(raw)}; using default`);
    return DEFAULT_PREMIUM_PRICE_CENTS;
  }
  return n;
}

export const PREMIUM_PRICE_CENTS = parsePremiumPriceCents(process.env.PREMIUM_PRICE_CENTS);

export function formatPriceUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
