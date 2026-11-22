import { BriefcaseBusiness, ChevronDown, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { QuoteListLink } from "@/components/quote/quote-buttons";
import { AccountLink, CartLink } from "@/components/store/cart-buttons";
import { getCategory } from "@/lib/api";
import type { SiteBrand, SiteHome, SiteNavLink, SiteNavResponse } from "@/lib/contract";
import { formatPrice } from "@/lib/price";
import { MobileNav } from "./mobile-nav";
import { CategoryNav, type MenuEntry } from "./category-nav";

const digits = (v: string) => v.replace(/[^\d+]/g, "");

/** The thin light strip above the desktop header: where we are, a few short links, phone, WhatsApp, quote. */
function TopBar({ brand, links }: { brand: SiteBrand; links: SiteHome["topLinks"] }) {
  const place = brand.address.split(",").slice(0, 2).join(",").trim();
  return (
    <div className="hidden border-b border-line bg-white text-xs text-muted-ink lg:block">
      <div className="container-site flex h-7 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {place && (
            <span className="inline-flex items-center gap-1.5 truncate">
              <MapPin className="size-3.5 shrink-0 text-brand-700" /> {place}
            </span>
          )}
          <ul className="hidden items-center gap-4 md:flex">
            {links.map((l) => (
              <li key={l.href} className="before:mr-4 before:text-line before:content-['|']">
                <Link href={l.href} className="transition-colors hover:text-brand-900">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {brand.phone && (
            <a href={`tel:${digits(brand.phone)}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-900" data-track="topbar-phone">
              <Phone className="size-3.5 text-brand-700" /> {brand.phone}
            </a>
          )}
          {brand.whatsapp && (
            <a href={`https://wa.me/${digits(brand.whatsapp).replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-900" data-track="topbar-whatsapp">
              <MessageCircle className="size-3.5 text-brand-700" /> <span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          <Link href="/quote" className="hidden h-5.5 items-center rounded-md bg-brand-900 px-2.5 text-[0.6875rem] font-semibold text-white transition-colors hover:bg-brand-800 sm:inline-flex">
            Get a quote
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Desktop product search (a plain form: works before any script loads): a bordered field with a category picker
 * (?in=laptops) and a green search button. Phones get a search icon in the header and the field on /search.
 */
function SearchBox({ categories, className }: { categories?: SiteNavLink[]; className?: string }) {
  return (
    <form action="/search" role="search" className={className}>
      <div className="flex h-11 items-center rounded-lg border border-line bg-white transition-shadow focus-within:border-brand-900 focus-within:ring-2 focus-within:ring-surface">
        {categories && categories.length > 1 && (
          <label className="relative flex h-full shrink-0 items-center border-r border-line">
            <span className="sr-only">Search in</span>
            <select name="in" defaultValue="" className="h-full max-w-40 appearance-none rounded-l-lg bg-transparent pr-8 pl-4 text-[0.8125rem] font-medium text-ink outline-none">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-ink" />
          </label>
        )}
        <label className="relative flex h-full min-w-0 flex-1 items-center">
          <span className="sr-only">Search products</span>
          <input type="search" name="q" required placeholder="Search laptops, desktops, components and more…" className="h-full w-full min-w-0 bg-transparent px-4 text-sm text-ink outline-none placeholder:text-muted-ink" />
          <button type="submit" aria-label="Search" className="-mr-px grid h-[calc(100%+2px)] w-14 shrink-0 place-items-center rounded-r-lg bg-brand-900 text-white transition-colors hover:bg-brand-800">
            <Search className="size-5" strokeWidth={2} />
          </button>
        </label>
      </div>
    </form>
  );
}


/** The category bar's data: one entry per product category (brands as sub-items, a few products), IT services and industries. */
async function menuEntries(nav: SiteNavResponse, home: SiteHome, ctaLabel: string): Promise<MenuEntry[]> {
  const pages = await Promise.all(nav.categories.map((c) => getCategory(c.slug).catch(() => null)));
  const cats: MenuEntry[] = nav.categories.map((c, i) => {
    const page = pages[i];
    return {
      key: `cat-${c.slug}`,
      label: c.name,
      href: `/products/${c.slug}`,
      icon: c.icon || "package",
      summary: c.summary,
      linksTitle: "Shop by brand",
      links: [
        { href: `/products/${c.slug}`, label: `All ${c.name}`, hint: "See everything in this range" },
        ...(page?.brands ?? []).map((b) => ({ href: `/products/${c.slug}?brand=${b.slug}`, label: b.name, hint: `${b.count} model${b.count === 1 ? "" : "s"}` })),
      ],
      products: (page?.products ?? [])
        .filter((p) => p.image)
        .slice(0, 3)
        .map((p) => ({ href: `/products/${p.categorySlug}/${p.slug}`, name: p.name, price: formatPrice(p.price, p.currency), image: p.image?.src ?? null })),
      promo: { title: "Buying in volume?", text: "Corporate pricing, VAT invoices and delivery across the Emirates.", href: "/quote", cta: ctaLabel },
    };
  });
  const more: MenuEntry[] = [];
  if (home.services.length)
    more.push({ key: "services", label: "IT services", href: "/services", icon: "layers", summary: "Network, security, support and office setup by one team.", linksTitle: "Services", links: home.services.map((s) => ({ href: s.href, label: s.label, icon: s.icon })), promo: { title: "Setting up an office?", text: "Planned and installed by one team.", href: "/quote?topic=office", cta: ctaLabel } });
  if (nav.industries.length)
    more.push({ key: "industries", label: "Industries", href: "/industries", icon: "building", summary: "IT matched to the way each kind of business works.", linksTitle: "IT by industry", links: nav.industries.map((x) => ({ href: `/industries/${x.slug}`, label: x.name, icon: x.icon || undefined })), promo: { title: "Not sure what fits?", text: "Tell us what your team does; we shortlist UAE models.", href: "/quote", cta: ctaLabel } });
  return [...cats, ...more];
}

/**
 * Store header. Phones: one white bar (menu, a small green logo, then search and quote list icons; owner 2026-11-22: no
 * green bar on phones); the search field itself is on
 * /search, and cart and account live in the app tab bar. Desktop: a white bar (logo, wide search, business enquiries,
 * quote list, account, cart) and the category bar with mega menus under it.
 */
export async function Header({ brand, home, nav }: { brand: SiteBrand; home: SiteHome; nav: SiteNavResponse }) {
  const entries = await menuEntries(nav, home, brand.ctaLabel);
  return (
    <>
      <TopBar brand={brand} links={home.topLinks} />
      <header className="sticky top-0 z-30 bg-white text-ink shadow-[0_1px_0_var(--color-line)]">
        <div className="container-site flex h-12 items-center gap-1 sm:h-14 lg:hidden">
          <MobileNav nav={nav} services={home.services} ctaLabel={brand.ctaLabel} />
          <Logo size="sm" className="ml-0.5" />
          <div className="ml-auto flex items-center">
            <Link href="/search" aria-label="Search products" className="grid size-10 place-items-center rounded-lg text-ink transition-colors hover:bg-surface hover:text-brand-900">
              <Search className="size-5" strokeWidth={2} />
            </Link>
            <QuoteListLink />
          </div>
        </div>

        <div className="container-site hidden h-[4.5rem] items-center gap-6 lg:flex xl:gap-8">
          <Logo tagline="Business IT · UAE" />
          <SearchBox categories={nav.categories} className="max-w-2xl flex-1" />
          <div className="ml-auto flex items-center gap-1">
            <Link href="/quote" className="mr-1 hidden h-10 items-center gap-2 rounded-lg border border-line px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand-900 hover:text-brand-900 xl:inline-flex" data-track="header">
              <BriefcaseBusiness className="size-4" /> {brand.ctaLabel}
            </Link>
            <QuoteListLink withLabel />
            <AccountLink />
            <CartLink />
          </div>
        </div>
        <CategoryNav entries={entries} />
      </header>
    </>
  );
}
