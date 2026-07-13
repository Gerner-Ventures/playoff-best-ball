import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { stripe, PREMIUM_PRICE_CENTS } from "@/lib/stripe";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

type Params = { params: Promise<{ leagueId: string }> };

const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** Starts a Stripe Checkout for the league's premium upgrade. Webhook completes it. */
export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership || membership.role !== "COMMISSIONER") {
    return NextResponse.json({ error: "Only the commissioner can upgrade" }, { status: 403 });
  }
  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });
  if (league.tier === "PREMIUM") {
    return NextResponse.json({ error: "Already premium", code: "ALREADY_PREMIUM" }, { status: 409 });
  }
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing isn't configured on this server." },
      { status: 501 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PREMIUM_PRICE_CENTS,
          product_data: {
            name: `Premium League — ${league.name} (${league.season} playoffs)`,
          },
        },
      },
    ],
    metadata: { leagueId: league.id, userId: user.id },
    success_url: `${APP_URL}/leagues/${league.id}?upgraded=1`,
    cancel_url: `${APP_URL}/leagues/${league.id}?upgrade=cancelled`,
  });
  // Analytics: awaited but can never throw (captureServerEvent swallows errors), so it can't break the request.
  await captureServerEvent(user.id, ANALYTICS_EVENTS.UPGRADE_CHECKOUT_STARTED, {
    leagueId: league.id,
  });
  return NextResponse.json({ url: session.url });
}
