import Stripe from "stripe";

// Missing key = billing off (dev default). Routes answer 501 with a clear message.
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;

// Price and mode live in their own modules so server components can import them
// without pulling in the Stripe SDK.
export { PREMIUM_PRICE_CENTS } from "./pricing";
export { stripeModeFromKey, type StripeMode } from "./stripe-mode";
