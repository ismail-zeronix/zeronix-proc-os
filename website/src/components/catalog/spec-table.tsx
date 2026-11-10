import type { SiteSpecGroup } from "@/lib/contract";

/**
 * Full specifications, grouped by the category's template (Performance, Display …). Two columns of groups on desktop,
 * each a compact label | value table with soft stripes, so a long sheet stays short and easy to scan.
 */
export function SpecTable({ groups }: { groups: SiteSpecGroup[] }) {
  if (!groups.length) return <p className="text-muted-ink">Full specifications are on their way. Ask us and we will send the data sheet.</p>;
  return (
    <div className="gap-4 lg:columns-2">
      {groups.map((g) => (
        <section key={g.label} className="mb-4 break-inside-avoid overflow-hidden rounded-card border border-line/70 bg-white">
          <h3 className="border-b border-line/70 bg-surface-soft px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-brand-900 uppercase">{g.label}</h3>
          <dl>
            {g.rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(7rem,38%)_minmax(0,1fr)] gap-4 px-4 py-2.5 text-sm even:bg-surface-soft/60">
                <dt className="text-muted-ink">{r.label}</dt>
                <dd className="font-medium break-words text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
