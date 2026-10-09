import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resubscribeByToken } from "@/domain/subscribers/unsubscribe";

/** The "Resubscribe" button on /unsubscribe after a mis-click. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const outcome = await resubscribeByToken(db, { token, now: new Date() });
  const target =
    outcome.result === "invalid"
      ? "/unsubscribe?status=invalid"
      : `/unsubscribe?token=${encodeURIComponent(String(token))}&status=resubscribed`;
  return NextResponse.redirect(new URL(target, req.url), 303);
}
