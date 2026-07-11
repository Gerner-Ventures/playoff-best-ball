import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { Resend } from "resend";
import { db } from "./db";

if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is missing");
}
if (process.env.APPLE_CLIENT_ID && !process.env.APPLE_CLIENT_SECRET) {
  throw new Error("APPLE_CLIENT_ID is set but APPLE_CLIENT_SECRET is missing");
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  // E2E-only escape hatch: password auth lets Playwright create sessions
  // without an email round-trip. Never enabled in production.
  emailAndPassword: {
    enabled: process.env.E2E_TEST_MODE === "1" && process.env.NODE_ENV !== "production",
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
          if (process.env.NODE_ENV === "production") {
            throw new Error("RESEND_API_KEY is not set; cannot send magic-link emails");
          }
          console.log(`[dev] magic link for ${email}: ${url}`);
          return;
        }
        const { error } = await resend.emails.send({
          // TODO: finalize sending domain before launch (spec open item: product name/domain)
          from: process.env.MAGIC_LINK_FROM_EMAIL ?? "Playoff Best Ball <auth@transactional.playoffbestball.com>",
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
