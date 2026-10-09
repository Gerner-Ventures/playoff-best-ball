export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-6 md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="card p-6">
          <p className="font-mono text-sm font-semibold text-brand">{String(i + 1).padStart(2, "0")}</p>
          <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-ink-soft">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
