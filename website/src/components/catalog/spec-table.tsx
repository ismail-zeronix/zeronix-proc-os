import type { SiteSpecGroup } from "@/lib/contract";

/** Full specifications, grouped by the category's template (Performance, Display …). */
export function SpecTable({ groups }: { groups: SiteSpecGroup[] }) {
  if (!groups.length) return <p className="text-muted-ink">Full specifications are on their way. Ask us and we will send the data sheet.</p>;
  return (
    <div className="grid gap-4">
      {groups.map((g) => (
        <section key={g.label} className="rounded-card bg-white p-2">
          <h3 className="px-4 pt-3 pb-2 text-sm font-semibold tracking-[0.12em] text-muted-ink uppercase">{g.label}</h3>
          <dl className="divide-y divide-line">
            {g.rows.map((r) => (
              <div key={r.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
                <dt className="text-sm text-muted-ink">{r.label}</dt>
                <dd className="font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
