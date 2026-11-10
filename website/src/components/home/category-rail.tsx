"use client";

import { ArrowUpRight, CaretLeft, CaretRight, Cpu, Desktop, HardDrives, Key, Keyboard, Laptop, Monitor, Package, type Icon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lift, RiseItem } from "@/components/motion/motion";
import { cn } from "@/lib/utils";

/** One card in the "Shop by category" row: a category, or a brand within a category ("Dell desktops"). */
export interface CategoryCardData {
  href: string;
  title: string;
  /** Live product count; 0 shows "On request". */
  count: number;
  /** A real product picture from that category (catalog photos are shot on white). */
  image?: string;
  /** The category's site icon name, used when there is no picture. */
  icon: string;
  /** "Brand" cards get a small tag so they read as a narrower pick than the category cards. */
  kind: "category" | "brand";
}

/** Phosphor duotone icons for the category icon names the portal uses. */
const ICONS: Record<string, Icon> = {
  laptop: Laptop,
  monitor: Desktop,
  cpu: Cpu,
  server: HardDrives,
  presentation: Monitor,
  keyboard: Keyboard,
  "key-round": Key,
};

const countLabel = (n: number) => (n ? `${n} ${n === 1 ? "product" : "products"}` : "On request");

function CategoryCard({ c }: { c: CategoryCardData }) {
  const Glyph = ICONS[c.icon] ?? Package;
  return (
    <Lift className="h-full">
      <Link href={c.href} className="group flex h-full flex-col rounded-card border border-line/70 bg-white p-2 transition-[border-color,box-shadow] duration-200 hover:border-brand-900/40 hover:shadow-lift" data-track="home-category">
        <span className="relative block aspect-square overflow-hidden rounded-inner bg-white">
          {c.image ? (
            <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 180px, 40vw" className="object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-canvas text-brand-700">
              <Glyph weight="duotone" className="size-14 transition-transform duration-500 group-hover:scale-110" />
            </span>
          )}
          {c.kind === "brand" && <span className="absolute top-1.5 left-1.5 rounded-full bg-brand-900 px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-white uppercase">Brand pick</span>}
        </span>
        <span className="flex flex-1 items-end justify-between gap-2 px-1.5 pt-2.5 pb-1">
          <span className="grid min-w-0 gap-0.5">
            <span className="line-clamp-2 text-[0.8125rem] leading-snug font-semibold text-ink sm:text-sm">{c.title}</span>
            <span className={cn("text-xs tabular-nums", c.count ? "text-muted-ink" : "font-semibold text-brand-700")}>{countLabel(c.count)}</span>
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-brand-800 transition-colors group-hover:border-brand-900 group-hover:bg-brand-900 group-hover:text-cta">
            <ArrowUpRight className="size-3.5" weight="bold" />
          </span>
        </span>
      </Link>
    </Lift>
  );
}

/**
 * "Shop by category" as one sideways row with the scrollbar hidden: swipe on phones, arrows (and the trackpad) on
 * desktop. The arrows fade out at either end.
 */
export function CategoryRail({ cards }: { cards: CategoryCardData[] }) {
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = row.current;
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const page = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });
  const arrow =
    "absolute top-[40%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white/95 text-brand-900 shadow-lift backdrop-blur transition-all duration-200 hover:border-brand-900 hover:bg-brand-900 hover:text-cta md:grid";

  if (!cards.length) return null;
  return (
    <div className="relative">
      <ul ref={row} aria-label="Product categories" className="scroll-row pt-1 lg:mx-0 lg:scroll-px-0 lg:px-0">
        {cards.map((c, i) => (
          <RiseItem key={c.href} index={i} className="w-[9.5rem] sm:w-44 lg:w-[calc((100%-5*0.625rem)/6)] xl:w-[calc((100%-6*0.625rem)/7)]">
            <CategoryCard c={c} />
          </RiseItem>
        ))}
      </ul>
      <button type="button" aria-label="Previous categories" onClick={() => page(-1)} className={cn(arrow, "-left-3 lg:-left-5", edge.start && "pointer-events-none opacity-0")}>
        <CaretLeft className="size-5" weight="bold" />
      </button>
      <button type="button" aria-label="More categories" onClick={() => page(1)} className={cn(arrow, "-right-3 lg:-right-5", edge.end && "pointer-events-none opacity-0")}>
        <CaretRight className="size-5" weight="bold" />
      </button>
    </div>
  );
}
