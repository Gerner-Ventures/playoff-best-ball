import Stripe from "stripe";

// Missing key = billing off (dev default). Routes answer 501 with a clear message.
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;

// Price lives in ./pricing so server components can import it without pulling in the Stripe SDK.
export { PREMIUM_PRICE_CENTS } from "./pricing";

// Mode is deliberately NOT re-exported here: ./stripe-mode exists so the admin page
// can read the mode without this module's `import Stripe from "stripe"`, and a
// re-export would hand future callers a path that drags the SDK back in.
