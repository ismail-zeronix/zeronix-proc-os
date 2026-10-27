/** A slim row of headline numbers (one bordered strip, hairline dividers) for detail pages. */
export function StatStrip({ items }: { items: { label: string; value: React.ReactNode; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 bg-card px-4 py-2.5">
          <div className="truncate text-xs text-muted-foreground">{i.label}</div>
          <div className="truncate text-xl font-semibold tracking-tight tabular-nums">{i.value}</div>
          {i.hint && <div className="truncate text-xs text-muted-foreground">{i.hint}</div>}
        </div>
      ))}
    </div>
  );
}
