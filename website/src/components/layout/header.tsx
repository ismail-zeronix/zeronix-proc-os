import { ChevronDown, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { QuoteListLink } from "@/components/quote/quote-buttons";
import { AccountLink, CartLink } from "@/components/store/cart-buttons";
import type { SiteBrand, SiteHome, SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";

const digits = (v: string) => v.replace(/[^\d+]/g, "");

/** The thin navy bar above the header: where we are, a few short links, phone, WhatsApp and the quote button. */
function TopBar({ brand, links }: { brand: SiteBrand; links: SiteHome["topLinks"] }) {
  const place = brand.address.split(",").slice(0, 2).join(",").trim();
  return (
    <div className="bg-brand-950 text-xs text-white/75">
      <div className="container-site flex h-7 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {place && (
            <span className="inline-flex items-center gap-1.5 truncate">
              <MapPin className="size-3.5 shrink-0 text-highlight" /> {place}
            </span>
          )}
          <ul className="hidden items-center gap-4 md:flex">
            {links.map((l) => (
              <li key={l.href} className="before:mr-4 before:text-white/25 before:content-['|']">
                <Link href={l.href} className="transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {brand.phone && (
            <a href={`tel:${digits(brand.phone)}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-white" data-track="topbar-phone">
              <Phone className="size-3.5 text-highlight" /> {brand.phone}
            </a>
          )}
          {brand.whatsapp && (
            <a href={`https://wa.me/${digits(brand.whatsapp).replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-white" data-track="topbar-whatsapp">
              <MessageCircle className="size-3.5 text-highlight" /> <span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          <Link href="/quote" className="hidden h-5.5 items-center rounded-full bg-cta px-2.5 text-[0.6875rem] font-semibold text-brand-950 transition-colors hover:bg-cta-strong sm:inline-flex">
            Get a quote
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Product search (a plain form: works before any script loads). On desktop a category picker sits inside the bar
 * (?in=laptops); /search then shows that category first and lets the visitor widen it again.
 */
function SearchBox({ categories, className }: { categories?: SiteNavLink[]; className?: string }) {
  return (
    <form action="/search" role="search" className={className}>
      <div className="flex h-10 items-center rounded-full border border-line bg-white transition-colors focus-within:border-brand-700">
        {categories && categories.length > 1 && (
          <label className="relative hidden h-full shrink-0 items-center border-r border-line lg:flex">
            <span className="sr-only">Search in</span>
            <select name="in" defaultValue="" className="h-full max-w-36 appearance-none rounded-l-full bg-surface-soft pr-7 pl-4 text-xs font-semibold text-brand-900 outline-none">
              <option value="">All products</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-brand-900" />
          </label>
        )}
        <label className="relative flex h-full min-w-0 flex-1 items-center">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            name="q"
            required
            placeholder="Search laptops, desktops, part numbers…"
            className="h-full w-full min-w-0 rounded-full bg-transparent pr-12 pl-4 text-sm text-ink outline-none placeholder:text-muted-ink"
          />
          <button type="submit" aria-label="Search" className="absolute right-1 grid size-8 place-items-center rounded-full bg-brand-900 text-cta transition-colors hover:bg-brand-800">
            <Search className="size-4" />
          </button>
        </label>
      </div>
    </form>
  );
}

/**
 * Store header: top bar, then a sticky row with logo, search and the quote list (search under it on phones), then the
 * menu row on desktop. Compact on purpose: the products should start high on the screen.
 */
export function Header({ brand, home, nav }: { brand: SiteBrand; home: SiteHome; nav: SiteNavResponse }) {
  return (
    <>
      <TopBar brand={brand} links={home.topLinks} />
      <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/95 backdrop-blur-xl">
        <div className="container-site flex h-14 items-center gap-2 sm:h-16 sm:gap-4">
          <MobileNav nav={nav} services={home.services} ctaLabel={brand.ctaLabel} />
          <Logo />
          <SearchBox categories={nav.categories} className="mx-auto hidden max-w-2xl flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <QuoteListLink withLabel />
            <CartLink />
            <AccountLink />
            <Link href="/quote" className="hidden h-10 items-center rounded-full bg-cta px-4 text-sm font-semibold text-brand-950 transition-colors hover:bg-cta-strong lg:inline-flex" data-track="header">
              {brand.ctaLabel}
            </Link>
          </div>
        </div>
        <div className="container-site pb-2.5 md:hidden">
          <SearchBox />
        </div>
        <div className="hidden border-t border-line/60 lg:block">
          <div className="container-site flex h-11 items-center">
            <MegaMenu nav={nav} services={home.services} ctaLabel={brand.ctaLabel} />
          </div>
        </div>
      </header>
    </>
  );
}
