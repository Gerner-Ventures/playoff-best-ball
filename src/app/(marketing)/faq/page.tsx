import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq-list";
import { faqItems } from "@/components/marketing/faq-content";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about NFL playoff best ball: the draft window, eliminations and byes, injuries, pricing and buy-ins.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const items = faqItems();
  return (
    <>
      <Section className="pt-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Questions</h1>
      </Section>
      <Section title="Playing">
        <FaqList items={items.filter((f) => f.category === "general")} />
      </Section>
      <Section title="Pricing">
        <FaqList items={items.filter((f) => f.category === "pricing")} />
      </Section>
      <ClosingCta page="faq" source="faq" />
    </>
  );
}
