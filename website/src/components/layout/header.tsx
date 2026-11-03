import { MapPin, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { QuoteListLink } from "@/components/quote/quote-buttons";
import { AccountLink, CartLink } from "@/components/store/cart-buttons";
import type { SiteBrand, SiteHome, SiteNavResponse } from "@/lib/contract";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";

const digits = (v: string) => v.replace(/[^\d+]/g, "");

/** The thin forest bar above the header: where we are, a few short links, phone, WhatsApp and the quote button. */
function TopBar({ brand, links }: { brand: SiteBrand; links: SiteHome["topLinks"] }) {
  const place = brand.address.split(",").slice(0, 2).join(",").trim();
  return (
    <div className="bg-forest-950 text-xs text-white/75">
      <div className="container-site flex h-8 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {place && (
            <span className="inline-flex items-center gap-1.5 truncate">
              <MapPin className="size-3.5 shrink-0 text-mint-300" /> {place}
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
              <Phone className="size-3.5 text-mint-300" /> {brand.phone}
            </a>
          )}
          {brand.whatsapp && (
            <a href={`https://wa.me/${digits(brand.whatsapp).replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-white" data-track="topbar-whatsapp">
              <MessageCircle className="size-3.5 text-mint-300" /> <span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          <Link href="/quote" className="hidden h-5.5 items-center rounded-full bg-lime-400 px-2.5 text-[0.6875rem] font-semibold text-forest-950 transition-colors hover:bg-lime-500 sm:inline-flex">
            Get a quote
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Product search (a plain form: works before any script loads). */
function SearchBox({ className }: { className?: string }) {
  return (
    <form action="/search" role="search" className={className}>
      <label className="relative block">
        <span className="sr-only">Search products</span>
        <input
          type="search"
          name="q"
          placeholder="Search laptops, desktops, part numbers…"
          className="h-10 w-full rounded-full border border-line bg-white pr-12 pl-4 text-sm text-ink placeholder:text-muted-ink focus:border-forest-700 focus:outline-none"
        />
        <button type="submit" aria-label="Search" className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-forest-900 text-lime-400 transition-colors hover:bg-forest-800">
          <Search className="size-4" />
        </button>
      </label>
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
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/95 backdrop-blur-xl">
        <div className="container-site flex h-14 items-center gap-2 sm:h-16 sm:gap-4">
          <MobileNav nav={nav} services={home.services} ctaLabel={brand.ctaLabel} />
          <Logo />
          <SearchBox className="mx-auto hidden max-w-xl flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <QuoteListLink withLabel />
            <CartLink />
            <AccountLink />
            <Link href="/quote" className="hidden h-10 items-center rounded-full bg-lime-400 px-4 text-sm font-semibold text-forest-950 transition-colors hover:bg-lime-500 lg:inline-flex" data-track="header">
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
