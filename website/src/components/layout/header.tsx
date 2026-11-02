import { MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import { Logo } from "@/components/brand/logo";
import { QuoteListLink } from "@/components/quote/quote-buttons";
import type { SiteBrand, SiteHome, SiteNavResponse } from "@/lib/contract";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";

const digits = (v: string) => v.replace(/[^\d+]/g, "");

/** The thin forest bar above the header: where we are, a few short links, phone, WhatsApp and the quote button. */
function TopBar({ brand, links }: { brand: SiteBrand; links: SiteHome["topLinks"] }) {
  const city = brand.address.split(",")[0]?.trim();
  return (
    <div className="bg-forest-950 text-[0.8125rem] text-white/75">
      <div className="container-site flex h-9 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {city && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 text-mint-300" /> {brand.address.split(",").slice(0, 2).join(",").trim() || city}
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
              <Phone className="size-3.5 text-mint-300" /> <span className="hidden sm:inline">{brand.phone}</span>
            </a>
          )}
          {brand.whatsapp && (
            <a href={`https://wa.me/${digits(brand.whatsapp).replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-white" data-track="topbar-whatsapp">
              <MessageCircle className="size-3.5 text-mint-300" /> <span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          <Link href="/quote" className="hidden h-6 items-center rounded-full bg-lime-400 px-3 text-xs font-semibold text-forest-950 transition-colors hover:bg-lime-500 sm:inline-flex">
            Get a quote
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Top bar, then the sticky paper header: logo, mega menu (from the portal's catalog), the quote list, the lime action. */
export function Header({ brand, home, nav }: { brand: SiteBrand; home: SiteHome; nav: SiteNavResponse }) {
  return (
    <>
      <TopBar brand={brand} links={home.topLinks} />
      <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/90 backdrop-blur-xl">
        <div className="container-site flex h-[4.5rem] items-center gap-4">
          <Logo />
          <div className="flex flex-1 justify-center">
            <MegaMenu nav={nav} services={home.services} ctaLabel={brand.ctaLabel} />
          </div>
          <div className="flex items-center gap-2">
            {/* the shop adds search and account here, and the quote list becomes the cart (WEBSITE-PLAN.md section 11) */}
            <QuoteListLink />
            <Action href="/quote" className="hidden sm:inline-flex" track="header">
              {brand.ctaLabel}
            </Action>
            <MobileNav nav={nav} services={home.services} ctaLabel={brand.ctaLabel} />
          </div>
        </div>
      </header>
    </>
  );
}
