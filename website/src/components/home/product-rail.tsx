"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/brand/cards";
import { RAIL_ROW } from "@/components/brand/skeleton";
import type { SiteProductSummary } from "@/lib/contract";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/**
 * A row of product cards that scrolls sideways. Phones swipe with snapping; on desktop the arrows move by whole cards
 * (so snapping never has to correct the stop) and a mouse can drag the row. The arrows fade out at either end.
 */
export function ProductRail({ products, label }: { products: SiteProductSummary[]; label: string }) {
  const row = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = row.current;
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  /** One card's width plus the gap. */
  const cardStep = () => {
    const el = row.current!;
    const first = el.firstElementChild as HTMLElement | null;
    return (first?.offsetWidth ?? el.clientWidth) + (parseFloat(getComputedStyle(el).columnGap) || 0);
  };

  const page = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const step = cardStep();
    const perView = Math.max(1, Math.floor((el.clientWidth + 1) / step));
    el.scrollBy({ left: dir * perView * step, behavior: "smooth" });
  };

  // mouse drag (touch and pens already scroll natively)
  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.scrollSnapType = "none";
    }
    e.currentTarget.scrollLeft = d.left - dx;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const el = e.currentTarget;
    const step = cardStep();
    // settle on the nearest card, then hand snapping back to the browser
    el.scrollTo({ left: Math.round(el.scrollLeft / step) * step, behavior: "smooth" });
    window.setTimeout(() => (el.style.scrollSnapType = ""), 400);
    // the drag ends over a card: swallow the click it would fire
    el.addEventListener("click", (ev) => ev.preventDefault(), { capture: true, once: true });
  };

  if (!products.length) return null;
  const arrow =
    "absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white/95 text-forest-900 shadow-lift backdrop-blur transition-all duration-200 hover:border-forest-900 hover:bg-forest-900 hover:text-lime-400 md:grid";
  return (
    <div className="relative">
      <ul
        ref={row}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
        className={cn(RAIL_ROW, "snap-x snap-mandatory")}
      >
        {products.map((p) => (
          <li key={p.slug} className="snap-start">
            <ProductCard href={`/products/${p.categorySlug}/${p.slug}`} brand={p.brand || p.category} name={p.name} specs={p.keySpecs} photo={p.image?.src} price={formatPrice(p.price, p.currency)} buy={p.price} />
          </li>
        ))}
      </ul>
      <button type="button" aria-label="Previous products" onClick={() => page(-1)} className={cn(arrow, "-left-3 lg:-left-5", edge.start && "pointer-events-none opacity-0")}>
        <ChevronLeft className="size-5" />
      </button>
      <button type="button" aria-label="More products" onClick={() => page(1)} className={cn(arrow, "-right-3 lg:-right-5", edge.end && "pointer-events-none opacity-0")}>
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
