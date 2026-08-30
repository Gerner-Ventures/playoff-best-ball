import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { Resend } from "resend";
import { db } from "./db";
import { DEMO_MODE_REQUESTED } from "./demo-mode";

if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is missing");
}
if (process.env.APPLE_CLIENT_ID && !process.env.APPLE_CLIENT_SECRET) {
  throw new Error("APPLE_CLIENT_ID is set but APPLE_CLIENT_SECRET is missing");
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  // No account.identityStrategy here on purpose: 1.7.2 does not expose that option
  // (the upgrade guide describes it, the shipped types don't have it). The defaults
  // already write the issuers we want — `local:credential` for password/magic-link
  // accounts and `local:oauth:<providerId>` for social — which is what the
  // 20260830000000_account_issuer backfill reproduces for pre-1.7 rows.

  // Password auth exists for two callers that have no inbox: Playwright, and the
  // demo deployment. This only MOUNTS the endpoints — reaching them additionally
  // requires the database sentinel, enforced in the auth route's POST wrapper
  // (src/app/api/auth/[...all]/route.ts), because Better Auth evaluates this
  // config at module init and cannot await a query. Never on in real production:
  // DEMO_MODE_REQUESTED is false unless the host is on a compiled-in allowlist.
  emailAndPassword: {
    enabled:
      (process.env.E2E_TEST_MODE === "1" && process.env.NODE_ENV !== "production") ||
      DEMO_MODE_REQUESTED,
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
    ...(process.env.APPLE_CLIENT_ID && {
      apple: {
        clientId: process.env.APPLE_CLIENT_ID,
        clientSecret: process.env.APPLE_CLIENT_SECRET!,
      },
    }),
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (!resend) {
          // The demo runs with NODE_ENV=production and no Resend key on purpose, so
          // it must log rather than throw — otherwise every sign-in attempt 500s.
          // Real production still fails loudly on a missing key.
          if (process.env.NODE_ENV === "production" && !DEMO_MODE_REQUESTED) {
            throw new Error("RESEND_API_KEY is not set; cannot send magic-link emails");
          }
          console.log(`[dev] magic link for ${email}: ${url}`);
          return;
        }
        const { error } = await resend.emails.send({
          // TODO: finalize sending domain before launch (spec open item: product name/domain)
          // `||` not `??`: the var ships as "" in .env.example, and an empty
          // string is a defined value, so `??` would pass from: "" to Resend.
          from: process.env.MAGIC_LINK_FROM_EMAIL || "Playoff Best Ball <auth@transactional.playoffbestball.com>",
          to: email,
          subject: "Your sign-in link",
          text: `Sign in to Playoff Best Ball: ${url}\n\nThis link expires in 5 minutes.`,
        });
        if (error) {
          console.error(`magic-link email to ${email} failed: ${error.name}: ${error.message}`);
          throw new Error(`Failed to send sign-in email: ${error.message}`);
        }
      },
    }),
  ],
});
