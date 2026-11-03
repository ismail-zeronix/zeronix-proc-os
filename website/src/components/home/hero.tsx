import { ArrowUpRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import { Float } from "@/components/motion/motion";
import type { SiteBrand, SiteHome, SiteProductSummary } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/**
 * Home hero, "the catalog in the window": a deep forest frame with the promise on the left and real products from the
 * catalog on the right (picture, name, price), so the first screen already shows what the store sells instead of a
 * stock photo. Benefits run along the bottom of the frame as a trust bar. The product cards float slowly (Motion), out
 * of step with each other. Nothing sits under the frame: the category row follows straight on.
 *
 * Colour roles stay BRAND.md: forest frame, mint for the one highlight on dark, lime on buttons and one small badge.
 */

/** Last two words of the headline in mint: the brand's one emphasis (never a gradient). */
function Headline({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  const cut = Math.max(1, words.length - 2);
  return (
    <h1 className="max-w-xl font-heading text-[2.125rem] leading-[1.04] font-medium tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.5rem]">
      {words.slice(0, cut).join(" ")} <span className="text-mint-300">{words.slice(cut).join(" ")}</span>
    </h1>
  );
}

const productHref = (p: SiteProductSummary) => `/products/${p.categorySlug}/${p.slug}`;

/** Price line on dark-panel cards: the price, or "Price on request" in the brand's quiet tone. */
function PriceLine({ p, big = false }: { p: SiteProductSummary; big?: boolean }) {
  const price = formatPrice(p.price, p.currency);
  return price ? (
    <span className={cn("font-heading font-semibold text-ink tabular-nums", big ? "text-xl" : "text-sm")}>
      {price}
      {big && <span className="ml-1.5 align-middle text-[0.6875rem] font-normal text-muted-ink">incl. VAT</span>}
    </span>
  ) : (
    <span className={cn("font-semibold text-forest-700", big ? "text-sm" : "text-xs")}>Price on request</span>
  );
}

/** The lead product: a large white card with the picture on white (the catalog photos are shot on white). */
function LeadCard({ p }: { p: SiteProductSummary }) {
  return (
    <Link href={productHref(p)} className="group relative flex flex-col rounded-[1.125rem] bg-white p-3 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.55)] transition-transform duration-300 hover:-translate-y-1" data-track="home-hero-product">
      <span className="relative block aspect-[4/3] overflow-hidden rounded-inner bg-white">
        {p.image && <Image src={p.image.src} alt={p.image.alt || p.name} fill priority sizes="(min-width: 1024px) 340px, 80vw" className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]" />}
      </span>
      <span className="grid gap-1 px-1.5 pt-2.5 pb-1">
        <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-ink uppercase">{p.brand || p.category}</span>
        <span className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold text-ink">{p.name}</span>
        <span className="mt-1 flex items-center justify-between gap-3">
          <PriceLine p={p} big />
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-forest-900 text-lime-400 transition-transform duration-200 group-hover:rotate-45">
            <ArrowUpRight className="size-4" />
          </span>
        </span>
      </span>
    </Link>
  );
}

/** A small product row card: picture, name, price. */
function MiniCard({ p, className }: { p: SiteProductSummary; className?: string }) {
  return (
    <Link href={productHref(p)} className={cn("group flex items-center gap-3 rounded-2xl bg-white p-2 pr-3 shadow-[0_18px_36px_-22px_rgb(0_0_0/0.6)] transition-transform duration-300 hover:-translate-y-0.5", className)} data-track="home-hero-product">
      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
        {p.image && <Image src={p.image.src} alt="" fill sizes="56px" className="object-contain p-1" />}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-xs font-semibold text-ink">{p.name}</span>
        <PriceLine p={p} />
      </span>
    </Link>
  );
}

/**
 * The right side of the frame: thin rings drawn behind the cards give depth without a glow or a grid (both banned in
 * BRAND.md), then one lead card and two small ones, offset like a hand of cards.
 */
function Showcase({ products, chip }: { products: SiteProductSummary[]; chip?: { value: string; label: string } }) {
  const [lead, ...rest] = products;
  if (!lead) return null;
  return (
    <div className="relative hidden min-h-[25rem] items-center justify-center overflow-hidden rounded-[1.25rem] bg-forest-900 p-8 lg:flex">
      <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute top-1/2 left-1/2 size-[140%] -translate-x-1/2 -translate-y-1/2 text-white/[0.06]" fill="none" stroke="currentColor">
        {[60, 105, 150, 195].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} strokeWidth="1" />
        ))}
      </svg>
      <div className="relative w-full max-w-[19rem]">
        {chip && (
          <span className="absolute -top-4 -left-6 z-20 inline-flex items-center gap-2 rounded-full bg-lime-400 py-1.5 pr-3.5 pl-1.5 text-xs font-semibold text-forest-950 shadow-lift">
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-forest-950 px-1.5 font-heading text-[0.6875rem] text-lime-400">{chip.value}</span>
            {chip.label}
          </span>
        )}
        <Float distance={5}>
          <LeadCard p={lead} />
        </Float>
        {rest[0] && (
          <Float delay={1.6} distance={8} className="absolute top-[42%] -left-20 w-56 xl:-left-28">
            <MiniCard p={rest[0]} />
          </Float>
        )}
        {rest[1] && (
          <Float delay={3.2} distance={8} className="absolute top-6 -right-14 w-56 xl:-right-24">
            <MiniCard p={rest[1]} />
          </Float>
        )}
      </div>
    </div>
  );
}

/** Phones and tablets: the same products as a short swipeable row inside the frame. */
function ShowcaseRow({ products }: { products: SiteProductSummary[] }) {
  if (!products.length) return null;
  return (
    <ul className="scroll-row mt-1 lg:hidden" aria-label="Featured products">
      {products.map((p) => (
        <li key={p.slug} className="w-64">
          <MiniCard p={p} className="shadow-none" />
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
  const chip = home.stats.find((s) => s.value && s.label);

  return (
    <section className="container-site pt-3 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-frame bg-forest-950 text-white">
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:p-3 lg:pl-12">
          <div className="grid content-center gap-4 sm:gap-5 lg:py-10">
            {h.eyebrow && (
              <p className="inline-flex items-center gap-2 justify-self-start rounded-full border border-white/15 py-1 pr-3 pl-2 text-[0.625rem] font-semibold tracking-[0.1em] text-white/80 uppercase sm:text-[0.6875rem] sm:tracking-[0.12em]">
                <span className="size-1.5 rounded-full bg-mint-300" />
                {h.eyebrow}
              </p>
            )}
            <Headline text={h.title || brand.tagline} />
            {h.subtitle && <p className="max-w-lg text-[0.9375rem] leading-relaxed text-white/70 sm:text-base">{h.subtitle}</p>}
            <div className="flex flex-wrap gap-2">
              <Action href="/products" size="lg" track="home-hero-shop">
                {h.shopLabel}
              </Action>
              <Action href="/quote" size="lg" variant="onDark" arrow={false} track="home-hero-quote">
                {brand.ctaLabel}
              </Action>
            </div>
            {h.checks.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/65">
                {h.checks.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-mint-300" strokeWidth={2.5} /> {c}
                  </li>
                ))}
              </ul>
            )}
            <ShowcaseRow products={picks} />
          </div>
          <Showcase products={picks} chip={chip} />
        </div>

        {home.benefits.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-white/10 px-5 py-4 sm:px-8 lg:grid-cols-4 lg:divide-x lg:divide-white/10 lg:px-6">
            {home.benefits.map((b) => (
              <li key={b.title} className="flex items-center gap-2.5 lg:px-6 lg:first:pl-6">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-mint-300">
                  <SiteIconView name={b.icon} className="size-[1.125rem]" strokeWidth={1.75} />
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
