"use client";

import { useEffect, useRef, useState } from "react";
import { RailSkeleton } from "@/components/brand/skeleton";
import type { SiteNavLink, SiteProductSummary } from "@/lib/contract";
import { MIN_SHELF } from "@/lib/shelf";
import { ProductRail } from "./product-rail";
import { ShelfHeading } from "./shelf-heading";

type State = { status: "waiting" | "loading" } | { status: "done"; products: SiteProductSummary[] };

/**
 * A category shelf that loads its products only when the visitor scrolls near it (site /api/products). Until then it
 * shows skeleton cards in the same shape, so the page does not jump. A category with fewer than MIN_SHELF products (a
 * half-empty rail looks broken), or a failed load, removes the shelf; the category is still on the category cards.
 */
export function LazyShelf({ category, limit = 12 }: { category: Pick<SiteNavLink, "slug" | "name" | "summary">; limit?: number }) {
  const box = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>({ status: "waiting" });

  useEffect(() => {
    const el = box.current;
    if (!el || state.status !== "waiting") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setState({ status: "loading" });
        fetch(`/api/products?category=${encodeURIComponent(category.slug)}&limit=${limit}`)
          .then((r) => (r.ok ? r.json() : { products: [] }))
          .then((d: { products?: SiteProductSummary[] }) => setState({ status: "done", products: d.products ?? [] }))
          .catch(() => setState({ status: "done", products: [] }));
      },
      // start a screen early, so on a normal scroll the cards are already there
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [category.slug, limit, state.status]);

  if (state.status === "done" && state.products.length < MIN_SHELF) return null;
  return (
    <section ref={box} className="container-site mt-1.5 sm:mt-3" aria-busy={state.status !== "done"}>
      <div className="-mx-3 bg-panel px-3 py-3 sm:mx-0 sm:rounded-xl sm:px-5 sm:py-5">
      <ShelfHeading title={category.name} lead={category.summary} href={`/products/${category.slug}`} linkLabel="View all" />
      {state.status === "done" ? (
        <div className="animate-in duration-500 fade-in">
          <ProductRail products={state.products} label={category.name} />
        </div>
      ) : (
        <RailSkeleton />
      )}
      </div>
    </section>
  );
}
