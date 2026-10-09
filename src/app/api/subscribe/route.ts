import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMarketingSender, isMarketingSenderReady } from "@/lib/email/marketing";
import { subscriberUrls } from "@/lib/site-url";
import { ConfirmationEmailFailedError, requestSubscription } from "@/domain/subscribers/subscribe";
import { SUBSCRIBE_SOURCES } from "@/domain/subscribers/sources";

const bodySchema = z.object({
  email: z.string().trim().max(254, "That email address is too long").pipe(z.email("Enter a valid email address")),
  source: z.enum(SUBSCRIBE_SOURCES),
  /** Honeypot: hidden from people, filled in by naive bots. */
  website: z.string().optional(),
});

const OK = { ok: true } as const;
const SEND_FAILED = { error: "We couldn't send the confirmation email — try again." } as const;

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Indistinguishable from success, so a bot learns nothing.
  if (parsed.data.website) return NextResponse.json(OK);

  // Checked before any DB access: in production with no sender configured, we must
  // not create/touch an EmailSubscriber row, and the response must not differ from
  // the send-failure path below — otherwise list membership leaks through status
  // codes (spec §5.2).
  if (!isMarketingSenderReady()) {
    const missing = [!process.env.RESEND_API_KEY && "RESEND_API_KEY", !process.env.MARKETING_FROM_EMAIL && "MARKETING_FROM_EMAIL"]
      .filter(Boolean)
      .join(", ");
    console.error(`[subscribe] marketing sender not ready; missing ${missing}`);
    return NextResponse.json(SEND_FAILED, { status: 502 });
  }

  try {
    await requestSubscription(db, getMarketingSender(), subscriberUrls(), {
      email: parsed.data.email,
      source: parsed.data.source,
      now: new Date(),
    });
  } catch (err) {
    if (err instanceof ConfirmationEmailFailedError) {
      console.error("[subscribe] confirmation email failed", err.cause);
      return NextResponse.json(SEND_FAILED, { status: 502 });
    }
    throw err;
  }
  // The same response whatever the outcome: the form must not reveal who is on the list.
  return NextResponse.json(OK);
}
