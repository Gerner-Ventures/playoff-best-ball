/**
 * Where a form signup came from. Imports nothing, so client components can use it.
 * "account" is reserved for account holders (spec §5.5) and the form never accepts it.
 */
export const SUBSCRIBE_SOURCES = [
  "home_hero",
  "footer",
  "how_it_works",
  "scoring",
  "commissioners",
  "faq",
  "pricing",
  "subscribe_page",
] as const;

export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

export const ACCOUNT_SOURCE = "account";
