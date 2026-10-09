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

// An already-active address returns immediately, while a new one waits on the
// Resend round trip. Left alone, that gap lets response timing reveal list
// membership (spec §5.2), so every 200 — the honeypot path included — is padded
// out to this floor. 400s (bad input) and 502s (the spec's accepted send-failure
// exception) are deliberately left unpadded.
export const MIN_SUBSCRIBE_RESPONSE_MS = 1200;

async function padTo200(startedAt: number) {
  const remaining = MIN_SUBSCRIBE_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return NextResponse.json(OK);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Indistinguishable from success, so a bot learns nothing.
  if (parsed.data.website) return padTo200(startedAt);

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
  return padTo200(startedAt);
}
