import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/domain/leagues/handle-checkout";

/** Stripe calls this; signature verification is the only auth. */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Billing isn't configured" }, { status: 501 });
  }
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.metadata?.leagueId) {
      // Not ours (shared Stripe account) — acknowledge and move on.
      console.warn(`[stripe] ignoring ${event.type} without leagueId metadata: ${session.id}`);
      return NextResponse.json({ received: true });
    }
    if (session.payment_status !== "paid") {
      // Async payment methods complete the session before money clears; wait for
      // checkout.session.async_payment_succeeded instead of granting early.
      console.warn(`[stripe] session ${session.id} completed but unpaid (${session.payment_status}) — not upgrading yet`);
      return NextResponse.json({ received: true });
    }
    if (session.amount_total === null) {
      console.warn(`[stripe] session ${session.id} has null amount_total — investigate before reconciliation`);
    }
    await handleCheckoutCompleted(db, {
      sessionId: session.id,
      leagueId: session.metadata.leagueId,
      userId: session.metadata?.userId ?? "unknown",
      amountCents: session.amount_total ?? -1, // -1 = Stripe omitted amount_total; investigate before reconciliation
    });
  }
  return NextResponse.json({ received: true });
}
