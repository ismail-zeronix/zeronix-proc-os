import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import type { SiteBrand, SiteHome, SiteProductSummary } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/**
 * Home hero, "the store window": a deep navy frame with the promise on the left and a tidy panel of real products on
 * the right (one large, two small, laid out on a grid: nothing floats or overlaps, so every name and price reads in
 * full). Benefits run along the bottom of the frame as a compact trust bar.
 *
 * Phones get a short version: headline, two buttons side by side, then the products as one swipeable row of compact
 * cards, so the first product is on the first screen. Colour roles stay BRAND.md: navy frame, mint for the one
 * highlight on dark and the main button.
 */

/** Last two words of the headline in mint: the brand's one emphasis (never a gradient). */
function Headline({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  const cut = Math.max(1, words.length - 2);
  return (
    <h1 className="max-w-xl font-heading text-[2rem] leading-[1.05] font-medium tracking-[-0.035em] text-white sm:text-[2.75rem] lg:text-[3.25rem]">
      {words.slice(0, cut).join(" ")} <span className="text-highlight">{words.slice(cut).join(" ")}</span>
    </h1>
  );
}

const productHref = (p: SiteProductSummary) => `/products/${p.categorySlug}/${p.slug}`;

function Price({ p, className }: { p: SiteProductSummary; className?: string }) {
  const price = formatPrice(p.price, p.currency);
  return price ? (
    <span className={cn("font-heading font-bold tracking-tight text-ink tabular-nums", className)}>{price}</span>
  ) : (
    <span className="text-xs font-semibold text-brand-700">Price on request</span>
  );
}

/** The lead product: picture on white beside its name, key specs and price. */
function LeadCard({ p }: { p: SiteProductSummary }) {
  return (
    <Link href={productHref(p)} className="group grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-4 rounded-2xl bg-white p-3 transition-shadow duration-300 hover:shadow-lift" data-track="home-hero-product">
      <span className="relative block aspect-square overflow-hidden rounded-xl bg-white">
        {p.image && <Image src={p.image.src} alt={p.image.alt || p.name} fill priority sizes="260px" className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04]" />}
      </span>
      <span className="grid content-center gap-2 pr-1">
        <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-brand-700 uppercase">{p.brand || p.category}</span>
        <span className="line-clamp-3 text-[0.9375rem] leading-snug font-semibold text-ink">{p.name}</span>
        {p.keySpecs.length > 0 && (
          <span className="flex max-h-[2.75rem] flex-wrap gap-1 overflow-hidden">
            {p.keySpecs.slice(0, 3).map((s) => (
              <span key={s} className="max-w-full truncate rounded-md bg-surface px-1.5 py-0.5 text-[0.6875rem] leading-4 text-brand-900">
                {s}
              </span>
            ))}
          </span>
        )}
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="grid leading-tight">
            <Price p={p} className="text-xl" />
            {p.price && <span className="text-[0.6875rem] text-muted-ink">incl. VAT</span>}
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-900 text-cta transition-transform duration-200 group-hover:rotate-45">
            <ArrowUpRight className="size-4" />
          </span>
        </span>
      </span>
    </Link>
  );
}

/** A compact product card: small picture, two-line name, price. Used under the lead card and in the phone row. */
function MiniCard({ p, className }: { p: SiteProductSummary; className?: string }) {
  return (
    <Link href={productHref(p)} className={cn("group flex h-full items-center gap-3 rounded-2xl bg-white p-2.5 transition-shadow duration-300 hover:shadow-lift", className)} data-track="home-hero-product">
      <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white">
        {p.image && <Image src={p.image.src} alt="" fill sizes="64px" className="object-contain p-1 transition-transform duration-500 group-hover:scale-[1.06]" />}
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="line-clamp-2 text-xs leading-snug font-semibold text-ink">{p.name}</span>
        <Price p={p} className="text-sm" />
      </span>
    </Link>
  );
}

/** Desktop: the product panel on the right of the frame. */
function Showcase({ products }: { products: SiteProductSummary[] }) {
  const [lead, ...rest] = products;
  if (!lead) return null;
  return (
    <div className="relative hidden overflow-hidden rounded-[1.25rem] bg-brand-900 p-4 lg:grid lg:content-center lg:gap-3">
      {/* thin rings behind the cards: depth without a glow or a grid (both banned in BRAND.md) */}
      <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -top-1/3 -right-1/3 size-[110%] text-white/[0.05]" fill="none" stroke="currentColor">
        {[70, 120, 170].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} strokeWidth="1" />
        ))}
      </svg>
      <div className="relative flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">
          <span className="size-1.5 rounded-full bg-highlight" /> New in the store
        </span>
        <Link href="/products" className="inline-flex items-center gap-1 text-xs font-semibold text-highlight hover:text-white">
          All products <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="relative">
        <LeadCard p={lead} />
      </div>
      {rest.length > 0 && (
        <div className="relative grid grid-cols-2 gap-3">
          {rest.slice(0, 2).map((p) => (
            <MiniCard key={p.slug} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Phones and tablets: the same products as one swipeable row inside the frame. */
function ShowcaseRow({ products }: { products: SiteProductSummary[] }) {
  if (!products.length) return null;
  return (
    <ul className="scroll-row lg:hidden" aria-label="New in the store">
      {products.map((p) => (
        <li key={p.slug} className="w-[17rem] sm:w-72">
          <MiniCard p={p} />
        </li>
      ))}
    </ul>
  );
}

/** The three products the hero shows: pictured ones only, priced first (a price is what a store visitor looks for). */
export function heroPicks(products: SiteProductSummary[]) {
  return products
    .filter((p) => p.image)
    .sort((a, b) => Number(Boolean(formatPrice(b.price))) - Number(Boolean(formatPrice(a.price))))
    .slice(0, 3);
}

export function Hero({ brand, home, picks }: { brand: SiteBrand; home: SiteHome; picks: SiteProductSummary[] }) {
  const h = home.hero;

  return (
    <section className="container-site pt-3 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-frame bg-brand-950 text-white">
        <div className={cn("grid gap-5 p-5 sm:gap-6 sm:p-8", picks.length > 0 && "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:p-4 lg:pl-12")}>
          <div className="grid content-center gap-4 sm:gap-5 lg:py-8">
            {h.eyebrow && (
              <p className="inline-flex items-center gap-2 justify-self-start rounded-full border border-white/15 py-1 pr-3 pl-2 text-[0.625rem] font-semibold tracking-[0.1em] text-white/80 uppercase sm:text-[0.6875rem] sm:tracking-[0.12em]">
                <span className="size-1.5 rounded-full bg-highlight" />
                {h.eyebrow}
              </p>
            )}
            <Headline text={h.title || brand.tagline} />
            {h.subtitle && <p className="line-clamp-3 max-w-lg text-[0.9375rem] leading-relaxed text-white/70 sm:line-clamp-none sm:text-base">{h.subtitle}</p>}
            {/* phones: two equal buttons side by side; from sm the usual pill pair */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {/* phones: no arrow circle, so both buttons fit side by side down to 320px */}
              <Action href="/products" size="lg" arrow={false} track="home-hero-shop" className="justify-center px-3 sm:hidden">
                {h.shopLabel}
              </Action>
              <Action href="/products" size="lg" track="home-hero-shop" className="hidden sm:inline-flex">
                {h.shopLabel}
              </Action>
              <Action href="/quote" size="lg" variant="onDark" arrow={false} track="home-hero-quote" className="justify-center px-3 sm:px-5">
                {brand.ctaLabel}
              </Action>
            </div>
            {h.checks.length > 0 && (
              <ul className="hidden flex-wrap gap-x-4 gap-y-1 text-xs text-white/65 sm:flex">
                {h.checks.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-highlight" strokeWidth={2.5} /> {c}
                  </li>
                ))}
              </ul>
            )}
            <ShowcaseRow products={picks} />
          </div>
          <Showcase products={picks} />
        </div>

        {home.benefits.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-white/10 px-5 py-3.5 sm:px-8 sm:py-4 lg:grid-cols-4 lg:divide-x lg:divide-white/10 lg:px-6">
            {home.benefits.map((b) => (
              <li key={b.title} className="flex items-center gap-2.5 lg:px-6 lg:first:pl-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-highlight sm:size-9">
                  <SiteIconView name={b.icon} className="size-4 sm:size-[1.125rem]" strokeWidth={1.75} />
                </span>
                <span className="grid leading-tight">
                  <span className="text-xs font-semibold text-white sm:text-sm">{b.title}</span>
                  {b.text && <span className="hidden text-xs text-white/55 sm:block">{b.text}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
