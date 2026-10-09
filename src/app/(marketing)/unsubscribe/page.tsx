import Link from "next/link";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** Button-driven for the same link-scanner reason as /subscribe/confirm. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;

  if (status === "invalid" || !token) {
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">We don&apos;t recognize that link</h1>
        <p className="mt-3 text-ink-soft">
          Try the unsubscribe link from your most recent email. If you have an account, you can also turn the digest off in{" "}
          <Link href="/settings/notifications" className="font-semibold text-brand underline-offset-4 hover:underline">
            notification settings
          </Link>
          .
        </p>
      </Section>
    );
  }

  if (status === "unsubscribed") {
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-ink-soft">You won&apos;t get the weekly digest anymore. Clicked by mistake?</p>
        <form method="post" action="/api/unsubscribe/undo" className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="btn">
            Resubscribe
          </button>
        </form>
      </Section>
    );
  }

  if (status === "resubscribed") {
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">You&apos;re back on the list</h1>
        <p className="mt-3 text-ink-soft">The weekly digest will keep coming.</p>
      </Section>
    );
  }

  return (
    <Section className="max-w-2xl pt-16">
      <h1 className="text-3xl font-semibold">Unsubscribe from the weekly digest?</h1>
      <form method="post" action="/api/unsubscribe" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Unsubscribe
        </button>
      </form>
    </Section>
  );
}
