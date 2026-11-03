"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ProductCard } from "@/components/brand/cards";
import { GRID_COLS, GridSkeleton } from "@/components/brand/skeleton";
import type { SiteProductSummary } from "@/lib/contract";
import { formatPrice } from "@/lib/price";

const noop = () => () => {};

/**
 * Endless scrolling for a category list. The server renders page `page` and the numbered page links (`children`), so
 * search engines and visitors without JavaScript still page through. Once this runs it hides those links and loads the
 * next page from site /api/products whenever the visitor nears the end, with skeleton cards while it waits.
 */
export function MoreProducts({
  category,
  brand,
  industry,
  page,
  pages,
  per,
  children,
}: {
  category: string;
  brand?: string;
  industry?: string;
  page: number;
  pages: number;
  per: number;
  children: React.ReactNode;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  // false in the server HTML and during hydration, true once the browser runs this
  const live = useSyncExternalStore(noop, () => true, () => false);
  const [loaded, setLoaded] = useState(page);
  const [items, setItems] = useState<SiteProductSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const more = loaded < pages && !failed;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || busy) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setBusy(true);
        const q = new URLSearchParams({ category, page: String(loaded + 1), per: String(per) });
        if (brand) q.set("brand", brand);
        if (industry) q.set("industry", industry);
        fetch(`/api/products?${q}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((d: { products: SiteProductSummary[] }) => {
            setItems((x) => [...x, ...d.products]);
            setLoaded((n) => n + 1);
          })
          .catch(() => setFailed(true))
          .finally(() => setBusy(false));
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // `live`: the sentinel only exists after hydration, so the observer is attached on that render
  }, [live, busy, more, loaded, category, brand, industry, per]);

  // a failed load hands paging back to the numbered links
  if (!live || failed || page > 1) return <>{children}</>;
  return (
    <>
      {items.length > 0 && (
        <div className={GRID_COLS}>
          {items.map((p) => (
            <ProductCard
              key={p.slug}
              className="animate-in duration-500 fade-in"
              href={`/products/${p.categorySlug}/${p.slug}`}
              brand={p.brand || p.category}
              name={p.name}
              specs={p.keySpecs}
              photo={p.image?.src}
              price={formatPrice(p.price, p.currency)}
              buy={p.price}
            />
          ))}
        </div>
      )}
      {more && (
        <div ref={sentinel}>
          <GridSkeleton />
        </div>
      )}
      {!more && pages > 1 && <p className="pt-2 text-center text-sm text-muted-ink">That is every model in this list.</p>}
    </>
  );
}
