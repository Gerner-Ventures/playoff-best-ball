import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { SignupForm } from "@/components/marketing/signup-form";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

/**
 * A button instead of confirming on page load: email security scanners open every
 * link, and would otherwise confirm signups nobody asked for (spec §5.3).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;

  if (status === "expired" || status === "invalid" || !token) {
    const expired = status === "expired";
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">{expired ? "That link has expired" : "That link isn't valid"}</h1>
        <p className="mt-3 text-ink-soft">
          {expired
            ? "Confirmation links work for 7 days. Sign up again and we'll send a fresh one."
            : "If you already confirmed, you're on the list. Otherwise, sign up again and we'll send a fresh link."}
        </p>
        <div className="mt-6">
          <SignupForm source="subscribe_page" />
        </div>
      </Section>
    );
  }

  return (
    <Section className="max-w-2xl pt-16">
      <h1 className="text-3xl font-semibold">One more step</h1>
      <p className="mt-3 text-ink-soft">Confirm you want the weekly playoff-race digest and a heads-up when leagues open.</p>
      <form method="post" action="/api/subscribe/confirm" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Confirm my email
        </button>
      </form>
    </Section>
  );
}
