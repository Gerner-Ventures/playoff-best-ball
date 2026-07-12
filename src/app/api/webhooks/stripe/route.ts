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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.metadata?.leagueId) {
      // Not ours (shared Stripe account) — acknowledge and move on.
      console.warn(`[stripe] ignoring checkout.session.completed without leagueId metadata: ${session.id}`);
      return NextResponse.json({ received: true });
    }
    await handleCheckoutCompleted(db, {
      sessionId: session.id,
      leagueId: session.metadata.leagueId,
      userId: session.metadata?.userId ?? "",
      amountCents: session.amount_total ?? 0,
    });
  }
  return NextResponse.json({ received: true });
}
