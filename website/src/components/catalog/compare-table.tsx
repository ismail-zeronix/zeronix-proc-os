import Link from "next/link";
import { Action } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import type { SiteCompareResponse, SiteProductSummary } from "@/lib/contract";
import { quoteLink } from "./page-parts";

/** Products side by side, spec row by spec row (compare page and guides). Scrolls sideways on a phone, not the page. */
export function CompareTable({ products, groups }: { products: SiteProductSummary[]; groups: SiteCompareResponse["groups"] }) {
  const cols = { gridTemplateColumns: `minmax(9rem,14rem) repeat(${products.length}, minmax(12rem,1fr))` };
  return (
    <div className="overflow-x-auto rounded-frame bg-white p-2">
      <div className="min-w-fit">
        <div className="grid gap-2" style={cols}>
          <div />
          {products.map((p) => (
            <div key={p.slug} className="grid content-start gap-3 rounded-card bg-surface-soft p-3">
              <Photo src={p.image?.src} subject={`${p.name}, product shot`} ratio="4:3" sizes="25vw" />
              <Link href={`/products/${p.categorySlug}/${p.slug}`} className="font-semibold hover:underline">
                {p.name}
              </Link>
              <Action href={quoteLink({ product: p.slug })} variant="dark" arrow={false} className="h-10 justify-center">
                Get B2B price
              </Action>
            </div>
          ))}
        </div>
        {groups.map((g) => (
          <div key={g.label} className="mt-2">
            <p className="px-4 pt-6 pb-2 text-xs font-semibold tracking-[0.12em] text-muted-ink uppercase">{g.label}</p>
            {g.rows.map((r) => (
              <div key={r.label} className="grid gap-2 border-t border-line px-2 py-3 text-sm" style={cols}>
                <div className="px-2 text-muted-ink">{r.label}</div>
                {r.values.map((v, i) => (
                  <div key={i} className="px-3 font-medium">
                    {v}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
