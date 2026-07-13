import Stripe from "stripe";

// Missing key = billing off (dev default). Routes answer 501 with a clear message.
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;

// Price lives in ./pricing so server components can import it without pulling in the Stripe SDK.
export { PREMIUM_PRICE_CENTS } from "./pricing";
