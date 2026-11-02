"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { ProductCard } from "@/components/brand/cards";
import type { SiteProductSummary } from "@/lib/contract";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

export interface Shelf {
  key: string;
  label: string;
  products: SiteProductSummary[];
}

/** Product shelf with tabs (newest, then one tab per category) and a row that scrolls sideways, with arrow buttons. */
export function FeaturedShelf({ shelves }: { shelves: Shelf[] }) {
  const [tab, setTab] = useState(shelves[0]?.key);
  const row = useRef<HTMLUListElement>(null);
  const shelf = shelves.find((s) => s.key === tab) ?? shelves[0];
  if (!shelf) return null;

  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });

  const arrow = "grid size-10 place-items-center rounded-full border border-line bg-white text-forest-900 transition-colors hover:border-forest-900";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex items-center justify-between gap-4">
        <div role="tablist" aria-label="Product groups" className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1">
          {shelves.length > 1 &&
            shelves.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={s.key === shelf.key}
                onClick={() => {
                  setTab(s.key);
                  row.current?.scrollTo({ left: 0 });
                }}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                  s.key === shelf.key ? "border-forest-900 bg-forest-900 text-white" : "border-line bg-white text-ink hover:border-forest-900",
                )}
              >
                {s.label}
              </button>
            ))}
        </div>
        {shelf.products.length > 4 && (
          <div className="hidden shrink-0 gap-2 lg:flex">
            <button type="button" aria-label="Previous products" onClick={() => scroll(-1)} className={arrow}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" aria-label="More products" onClick={() => scroll(1)} className={arrow}>
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>
      <ul ref={row} className="-mx-1 grid snap-x snap-mandatory auto-cols-[78%] grid-flow-col gap-4 overflow-x-auto px-1 pb-2 sm:auto-cols-[45%] lg:auto-cols-[calc((100%-3rem)/4)]">
        {shelf.products.map((p) => (
          <li key={p.slug} className="snap-start">
            <ProductCard href={`/products/${p.categorySlug}/${p.slug}`} brand={p.brand || p.category} name={p.name} specs={p.keySpecs} photo={p.image?.src} price={formatPrice(p.price, p.currency)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
