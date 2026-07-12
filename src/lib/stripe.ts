import Stripe from "stripe";

// Missing key = billing off (dev default). Routes answer 501 with a clear message.
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;

export const PREMIUM_PRICE_CENTS = 2500; // ~$25/league/season per the spec (open item: exact price)
