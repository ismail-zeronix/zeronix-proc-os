"use client";

import { ArrowRight, Building2, ChevronDown, Wrench } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteIconView } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface MenuLink {
  href: string;
  label: string;
  hint?: string;
  icon?: string;
}
export interface MenuProduct {
  href: string;
  name: string;
  price: string | null;
  image: string | null;
}
export interface MenuEntry {
  key: string;
  label: string;
  href: string;
  /** An editor-picked icon name (categories); services and industries have fixed icons. */
  icon: string;
  summary?: string;
  linksTitle: string;
  links: MenuLink[];
  products?: MenuProduct[];
  promo?: { title: string; text: string; href: string; cta: string };
}

const FIXED = { services: Wrench, industries: Building2 } as const;

function EntryIcon({ entry, className }: { entry: MenuEntry; className?: string }) {
  const F = entry.key in FIXED ? FIXED[entry.key as keyof typeof FIXED] : null;
  return F ? <F className={className} strokeWidth={1.75} /> : <SiteIconView name={entry.icon} className={className} strokeWidth={1.75} />;
}

/**
 * Desktop category bar under the header: every product category (and IT services, industries) with its icon and a
 * chevron. Hovering or focusing one opens a full-width mega menu under the bar: shop by brand, popular products and
 * the B2B call. Phones use the slide-out menu and the tab bar instead.
 */
export function CategoryNav({ entries }: { entries: MenuEntry[] }) {
  const [active, setActive] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const later = useCallback((fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);
  // a short delay both ways, so sweeping the mouse across the bar does not flash every menu
  const openSoon = useCallback((key: string) => later(() => setActive(key), active ? 0 : 90), [active, later]);
  const closeSoon = useCallback(() => later(() => setActive(null), 160), [later]);
  const keep = useCallback(() => timer.current && clearTimeout(timer.current), []);

  // a new page closes the menu (set during render, React's pattern for state that follows a prop)
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setActive(null);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const current = entries.find((e) => e.key === active) ?? null;
  const side = current && ((current.products?.length ?? 0) > 0 || current.promo);

  return (
    <nav aria-label="Shop by category" className="relative hidden border-t-2 border-cta bg-white lg:block" onMouseLeave={closeSoon}>
      <ul className="container-site flex h-12 items-stretch justify-between gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((e) => {
          const on = active === e.key;
          return (
            <li key={e.key} className="flex shrink-0">
              <Link
                href={e.href}
                aria-expanded={on}
                onMouseEnter={() => openSoon(e.key)}
                onFocus={() => {
                  keep();
                  setActive(e.key);
                }}
                className={cn(
                  "relative flex items-center gap-1.5 px-1 text-[0.8125rem] font-medium whitespace-nowrap transition-colors 2xl:gap-2 2xl:px-2 2xl:text-sm",
                  on ? "text-brand-900" : "text-ink hover:text-brand-900",
                )}
              >
                <EntryIcon entry={e} className={cn("hidden size-[1.15rem] shrink-0 xl:block", on ? "text-brand-900" : "text-ink/70")} />
                {e.label}
                <ChevronDown className={cn("size-3.5 shrink-0 text-muted-ink transition-transform duration-200", on && "rotate-180 text-brand-900")} />
                <span aria-hidden className={cn("absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand-900 transition-opacity", on ? "opacity-100" : "opacity-0")} />
              </Link>
            </li>
          );
        })}
      </ul>

      {current && (
        <div role="region" aria-label={current.label} onMouseEnter={keep} className="absolute inset-x-0 top-full z-40 border-y border-line bg-white shadow-[0_16px_32px_-16px_rgb(29_35_48/0.25)] animate-in fade-in-0 duration-150">
          <div className={cn("container-site grid gap-8 py-6", side && "grid-cols-[1fr_19rem]")}>
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-surface text-brand-900">
                    <EntryIcon entry={current} className="size-6" />
                  </span>
                  <div>
                    <p className="text-lg leading-tight font-semibold text-ink">{current.label}</p>
                    {current.summary && <p className="max-w-lg text-sm text-muted-ink">{current.summary}</p>}
                  </div>
                </div>
                <Link href={current.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800">
                  View all <ArrowRight className="size-4" />
                </Link>
              </div>
              <p className="mt-5 mb-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-ink uppercase">{current.linksTitle}</p>
              <ul className="grid grid-cols-2 gap-1 xl:grid-cols-3">
                {current.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="group/l flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-surface">
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-soft text-brand-900 group-hover/l:bg-white">
                        {l.icon ? <SiteIconView name={l.icon} className="size-4" strokeWidth={1.9} /> : <ArrowRight className="size-4" />}
                      </span>
                      <span className="grid min-w-0 leading-tight">
                        <span className="truncate text-sm font-medium text-ink">{l.label}</span>
                        {l.hint && <span className="truncate text-xs text-muted-ink">{l.hint}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {side && (
              <div className="grid content-start gap-3">
                {current.products && current.products.length > 0 && (
                  <>
                    <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-ink uppercase">Popular now</p>
                    {current.products.map((p) => (
                      <Link key={p.href} href={p.href} className="flex items-center gap-3 rounded-lg border border-line bg-white p-2 transition-colors hover:border-brand-900">
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-white">
                          {p.image && <Image src={p.image} alt="" fill sizes="56px" className="object-contain p-1" />}
                        </span>
                        <span className="grid min-w-0 gap-0.5 leading-tight">
                          <span className="line-clamp-2 text-xs font-medium text-ink">{p.name}</span>
                          <span className="text-sm font-semibold text-ink">{p.price ?? "Price on request"}</span>
                        </span>
                      </Link>
                    ))}
                  </>
                )}
                {current.promo && (
                  <Link href={current.promo.href} className="group/promo grid gap-1.5 rounded-xl bg-brand-900 p-4 text-white">
                    <span className="text-base leading-tight font-semibold">{current.promo.title}</span>
                    <span className="text-sm text-white/85">{current.promo.text}</span>
                    <span className="mt-1.5 inline-flex h-9 items-center gap-2 self-start rounded-lg bg-white px-4 text-sm font-semibold text-brand-900">
                      {current.promo.cta} <ArrowRight className="size-4 transition-transform group-hover/promo:translate-x-0.5" />
                    </span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
