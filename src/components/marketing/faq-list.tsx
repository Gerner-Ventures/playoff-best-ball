import type { FaqItem } from "./faq-content";

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {items.map((item) => (
        <div key={item.id} id={item.id} className="grid gap-2 py-5 md:grid-cols-[2fr_3fr] md:gap-8">
          <dt className="font-semibold text-ink">{item.question}</dt>
          <dd className="text-ink-soft">{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
