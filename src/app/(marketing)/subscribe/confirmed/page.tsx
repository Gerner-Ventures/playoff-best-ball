import Link from "next/link";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "You're on the list", robots: { index: false } };

export default function ConfirmedPage() {
  return (
    <Section className="max-w-2xl pt-16">
      <h1 className="text-3xl font-semibold">You&apos;re on the list</h1>
      <p className="mt-3 text-ink-soft">
        Expect one email a week through the regular season, and a heads-up when it&apos;s time to set up your
        league. Every email has a one-click unsubscribe.
      </p>
      <p className="mt-6">
        <Link href="/how-it-works" className="btn">
          How it works
        </Link>
      </p>
    </Section>
  );
}
