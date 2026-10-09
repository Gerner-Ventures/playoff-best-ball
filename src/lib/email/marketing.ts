import { Resend } from "resend";
import type { MarketingEmail, MarketingSender } from "@/domain/subscribers/sender";
import { DEMO_MODE_REQUESTED } from "@/lib/demo-mode";

/** The slice of the Resend client this module uses; tests pass a fake. */
export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      headers: Record<string, string>;
    }): Promise<{ error: { name: string; message: string } | null }>;
  };
}

/**
 * List mail only, from the news. subdomain so complaints about marketing mail
 * cannot hurt magic-link delivery on transactional. (spec §5.6). Every message
 * carries RFC 8058 one-click headers, which Gmail and Yahoo expect from bulk senders.
 */
export function createMarketingSender(opts: {
  resend: ResendLike | null;
  from: string | undefined;
  /** True where a missing config must fail loudly instead of logging (real production). */
  mustSend: boolean;
  log?: (line: string) => void;
}): MarketingSender {
  const log = opts.log ?? ((line: string) => console.log(line));
  return {
    async send(email: MarketingEmail) {
      if (opts.resend && opts.from) {
        const { error } = await opts.resend.emails.send({
          from: opts.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: {
            "List-Unsubscribe": `<${email.oneClickUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        if (error) throw new Error(`marketing email to ${email.to} failed: ${error.name}: ${error.message}`);
        return;
      }
      if (opts.mustSend) {
        throw new Error("RESEND_API_KEY and MARKETING_FROM_EMAIL must both be set to send list email in production");
      }
      // Same convention as magic links in src/lib/auth.ts: dev and the demo log instead of sending.
      log(`[dev] marketing email to ${email.to}: ${email.subject}\n${email.text}`);
    },
  };
}

let cached: MarketingSender | null = null;

export function getMarketingSender(): MarketingSender {
  cached ??= createMarketingSender({
    resend: process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null,
    // `||` not `??`: .env.example ships the var as "", which must count as unset.
    from: process.env.MARKETING_FROM_EMAIL || undefined,
    mustSend: process.env.NODE_ENV === "production" && !DEMO_MODE_REQUESTED,
  });
  return cached;
}
