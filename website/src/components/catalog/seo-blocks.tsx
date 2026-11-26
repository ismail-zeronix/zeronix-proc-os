import Link from "next/link";
import type { SiteFaqItem, SiteProductSummary } from "@/lib/contract";
import { formatPrice } from "@/lib/price";

/**
 * The buying-guide pieces of category, brand and landing pages (SEO audit 2026-11-25): the intro above the products,
 * the specs worth comparing, a comparison table of the top models, and rows of links. Built only from existing styles
 * (panel, line, muted-ink, the chip links used on category pages), so the look stays the same.
 */

/** About 150 words above the product list. */
export function BuyingLead({ paragraphs, title }: { paragraphs: string[]; title?: string }) {
  if (!paragraphs.length) return null;
  return (
    <section className="container-site pt-3 sm:pt-6">
      <div className="grid max-w-4xl gap-2 rounded-card border border-line/70 bg-panel p-4 text-sm text-muted-ink sm:p-6 sm:text-[0.9375rem]">
        {title && <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>}
        {paragraphs.map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
      </div>
    </section>
  );
}

/** "Key specs to compare": what matters and why, one line each. */
export function SpecGuide({ title, items }: { title: string; items: { name: string; why: string }[] }) {
  if (!items.length) return null;
  return (
    <section className="container-site py-4 sm:py-6">
      <div className="rounded-card border border-line/70 bg-panel p-4 sm:p-6">
        <h2 className="text-h2">{title}</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <div key={s.name} className="grid gap-0.5">
              <dt className="text-sm font-semibold text-ink">{s.name}</dt>
              <dd className="text-sm text-muted-ink">{s.why}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** The top models side by side: pictured and priced ones first, the three key specs every card carries, the price. */
export function CompareTable({ title, products, labels, max = 5 }: { title: string; products: SiteProductSummary[]; labels: [string, string, string]; max?: number }) {
  const score = (p: SiteProductSummary) => Number(Boolean(formatPrice(p.price))) * 2 + Number(Boolean(p.image)) + Number(p.keySpecs.filter(Boolean).length === 3);
  const top = [...products].sort((a, b) => score(b) - score(a)).slice(0, max);
  if (top.length < 2) return null;
  return (
    <section className="container-site py-4 sm:py-6">
      <h2 className="text-h2">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-line/70 bg-panel">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line/70 text-xs text-muted-ink">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Model
              </th>
              {labels.map((l) => (
                <th key={l} scope="col" className="px-4 py-2.5 font-semibold">
                  {l}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Price
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {top.map((p) => (
              <tr key={p.slug}>
                <th scope="row" className="px-4 py-2.5 font-semibold text-ink">
                  <Link href={`/products/${p.categorySlug}/${p.slug}`} className="hover:text-brand-700">
                    {p.name}
                  </Link>
                  {p.mpn && <span className="block text-xs font-normal text-muted-ink">{p.mpn}</span>}
                </th>
                {labels.map((l, i) => (
                  <td key={l} className="px-4 py-2.5 text-muted-ink">
                    {p.keySpecs[i] || "-"}
                  </td>
                ))}
                <td className="px-4 py-2.5 whitespace-nowrap text-ink">{(p.priceMode === "public" && formatPrice(p.price, p.currency)) || "On request"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A labelled row of chip links (the style the category page already uses for guides and industries). */
export function ChipLinks({ label, items, plain = [] }: { label: string; items: { href: string; label: string }[]; plain?: string[] }) {
  if (!items.length && !plain.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      <span className="mr-1 font-semibold text-ink">{label}</span>
      {items.map((x) => (
        <Link key={x.href} href={x.href} className="rounded-full border border-line bg-panel px-3.5 py-1.5 hover:border-brand-700/40">
          {x.label}
        </Link>
      ))}
      {plain.map((x) => (
        <span key={x} className="rounded-full border border-line/60 px-3.5 py-1.5 text-muted-ink">
          {x}
        </span>
      ))}
    </div>
  );
}

/** Editor questions first, then ours that the editor has not already asked. */
export function mergeFaq(own: SiteFaqItem[], extra: SiteFaqItem[]): SiteFaqItem[] {
  const seen = new Set(own.map((f) => f.q.trim().toLowerCase()));
  return [...own, ...extra.filter((f) => !seen.has(f.q.trim().toLowerCase()))];
}
