export function Section({
  title,
  eyebrow,
  id,
  className = "",
  children,
}: {
  title?: string;
  eyebrow?: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 ${className}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-brand">{eyebrow}</p>}
      {title && <h2 className="mt-1 text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">{title}</h2>}
      <div className={title ? "mt-8" : ""}>{children}</div>
    </section>
  );
}
