import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Action, SectionHeading, Tag } from "@/components/brand/action";
import { DarkCard, IconBadge, PhotoCard, Stat } from "@/components/brand/cards";
import { Photo } from "@/components/brand/photo";
import type { SiteBrand, SiteHome, SiteIndustryCard, SiteNavLink } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";
import { FeaturedShelf, type Shelf } from "./featured";

/** Home page sections in the brand (BRAND.md): every section uses the brand components, nothing one-off. */

/** Section header row: a short lime rule and the title, a line under it, and a "view all" link on the right. */
function ShelfHeading({ title, lead, href, linkLabel }: { title: string; lead?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="reveal flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div>
        <h2 className="flex items-center gap-4 text-h2 text-ink">
          <span aria-hidden className="h-1.5 w-10 shrink-0 rounded-full bg-lime-400" />
          {title}
        </h2>
        {lead && <p className="mt-3 max-w-2xl text-muted-ink">{lead}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="group inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:text-forest-950">
          {linkLabel} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export function Industries({ industries }: { industries: SiteIndustryCard[] }) {
  if (!industries.length) return null;
  return (
    <section id="industries" className="container-site scroll-mt-24 pt-20 pb-16 sm:pt-24">
      <ShelfHeading title="Explore by industry" lead="IT matched to the way each kind of business works." href="/industries" linkLabel="View all industries" />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
        {industries.slice(0, 6).map((x) => (
          <PhotoCard key={x.slug} href={`/industries/${x.slug}`} title={x.name} ratio="4:3" photo={x.image?.src ?? imageFor(`industry-${x.slug}`)} subject={`${x.name}: ${x.summary}`} className="reveal" />
        ))}
      </div>
    </section>
  );
}

/** Two panels side by side: the dark business panel and the light new-office checklist, each with a photo. */
export function Promos({ business, office }: { business: SiteHome["business"]; office: SiteHome["office"] }) {
  if (!business.title && !office.title) return null;
  return (
    <section className="container-site pb-20">
      <div className="grid gap-4 lg:grid-cols-2">
        {business.title && (
          <div className="reveal grid overflow-hidden rounded-frame bg-forest-900 text-white sm:grid-cols-[1.1fr_1fr]">
            <div className="grid content-center gap-4 p-7 sm:p-9">
              <Tag onDark>Business</Tag>
              <h2 className="text-2xl leading-tight font-medium sm:text-[1.75rem]">{business.title}</h2>
              {business.text && <p className="text-white/70">{business.text}</p>}
              {business.cta && (
                <Action href={business.href || "/quote"} track="home-business">
                  {business.cta}
                </Action>
              )}
            </div>
            <Photo src={imageFor("promo-business") ?? imageFor("industry-finance-accounting")} subject="Glass office tower in Dubai" ratio="4:3" tone="dark" className="h-full rounded-none sm:aspect-auto" />
          </div>
        )}
        {office.title && (
          <div className="reveal grid overflow-hidden rounded-frame bg-white sm:grid-cols-[1.1fr_1fr]">
            <div className="grid content-center gap-5 p-7 sm:p-9">
              <h2 className="flex items-center gap-3 text-2xl leading-tight font-medium sm:text-[1.75rem]">
                <span aria-hidden className="h-1.5 w-8 shrink-0 rounded-full bg-lime-400" />
                {office.title}
              </h2>
              <ul className="grid gap-2.5">
                {office.items.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="group inline-flex items-center gap-3 text-[0.9375rem] text-ink hover:text-forest-700">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-lime-400 text-forest-950">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Photo src={imageFor("promo-office") ?? imageFor("industry-corporate-offices")} subject="Bright open-plan office with desks and a meeting table" ratio="4:3" className="h-full rounded-none sm:aspect-auto" />
          </div>
        )}
      </div>
    </section>
  );
}

/** Small category tiles: the category photo when there is one, otherwise its icon on sage. */
export function CategoryTiles({ categories }: { categories: SiteNavLink[] }) {
  if (!categories.length) return null;
  return (
    <section className="container-site pb-20">
      <ShelfHeading title="Shop by product category" lead="Business laptops, desktops, workstations, screens and the rest of the desk." href="/products" linkLabel="Browse all products" />
      <ul className="mt-10 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
        {categories.map((c) => {
          const photo = imageFor(`category-${c.slug}`);
          return (
            <li key={c.slug}>
              <Link href={`/products/${c.slug}`} className="group reveal flex h-full flex-col items-center gap-3 rounded-card bg-white p-3 pb-4 text-center transition-shadow duration-200 hover:shadow-lift">
                {photo ? (
                  <Photo src={photo} subject={c.name} ratio="1:1" sizes="160px" className="w-full" />
                ) : (
                  <span className="grid aspect-square w-full place-items-center rounded-inner bg-sage-50 text-forest-800 transition-colors group-hover:bg-sage-100">
                    <SiteIconView name={c.icon} className="size-10" strokeWidth={1.25} />
                  </span>
                )}
                <span className="text-sm leading-snug font-semibold text-ink">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The forest band for ready-to-work bundles, with a photo in the middle when one exists. */
export function BundlesBand({ bundles }: { bundles: SiteHome["bundles"] }) {
  if (!bundles.title) return null;
  const photo = imageFor("bundle");
  return (
    <section className="container-site pb-20">
      <div className="reveal grid items-center gap-6 overflow-hidden rounded-frame bg-forest-900 px-7 py-8 text-white sm:px-10 lg:grid-cols-[1.2fr_1fr_auto]">
        <div className="grid gap-2">
          <h2 className="text-2xl font-medium sm:text-[1.75rem]">{bundles.title}</h2>
          {bundles.text && <p className="text-white/70">{bundles.text}</p>}
        </div>
        {photo ? <Photo src={photo} subject="Laptop, monitor, dock and headset bundle" ratio="21:9" sizes="420px" className="hidden lg:block" /> : <span className="hidden lg:block" />}
        {bundles.cta && (
          <Action href={bundles.href || "/quote"} size="lg" track="home-bundles">
            {bundles.cta}
          </Action>
        )}
      </div>
    </section>
  );
}

export function Featured({ featured, shelves }: { featured: SiteHome["featured"]; shelves: Shelf[] }) {
  const withProducts = shelves.filter((s) => s.products.length);
  if (!withProducts.length) return null;
  return (
    <section className="container-site pb-20">
      <ShelfHeading title={featured.title} lead={featured.text} href="/products" linkLabel="All products" />
      <div className="mt-8">
        <FeaturedShelf shelves={withProducts} />
      </div>
    </section>
  );
}

/** IT services as icon tiles, each to its service page. */
export function Services({ services }: { services: SiteHome["services"] }) {
  if (!services.length) return null;
  return (
    <section className="container-site pb-24">
      <ShelfHeading title="Our IT services" lead="End-to-end IT to build, secure and run your business." href="/services" linkLabel="View all services" />
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {services.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="group reveal flex h-full flex-col items-center gap-3 rounded-card bg-white px-3 py-5 text-center transition-shadow duration-200 hover:shadow-lift">
              <IconBadge name={s.icon} className="size-12 bg-sage-100 text-forest-900 transition-colors group-hover:bg-lime-400 group-hover:text-forest-950" />
              <span className="text-sm leading-snug font-semibold text-ink">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Forest band: reasons as dark cards, the key numbers underneath. */
export function WhyUs({ brand, home }: { brand: SiteBrand; home: SiteHome }) {
  if (!home.reasons.length && !home.stats.length) return null;
  return (
    <section className="frame bg-forest-900 py-20 sm:py-24">
      <div className="container-site">
        <SectionHeading onDark rule tag={`Why ${brand.name}`} title="A partner for business IT, not a shopping cart" lead="Business series only, UAE part numbers and warranty, and advice before you buy." />
        {home.reasons.length > 0 && (
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {home.reasons.map((r) => (
              <DarkCard key={r.title} icon={r.icon} title={r.title} text={r.text} className="reveal" />
            ))}
          </div>
        )}
        {home.stats.length > 0 && (
          <dl className="mt-14 grid grid-cols-2 gap-8 border-t border-white/10 pt-10 lg:grid-cols-4">
            {home.stats.map((s) => (
              <Stat key={s.label} onDark value={s.value} label={s.label} />
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/** Brand names as type (no trademark artwork). */
export function Brands({ brands }: { brands: SiteNavLink[] }) {
  if (!brands.length) return null;
  return (
    <section className="container-site pb-24">
      <div className="flex flex-col items-center gap-8 border-y border-line py-12 lg:flex-row lg:justify-between">
        <Tag>Business series from</Tag>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {brands.map((b) => (
            <li key={b.slug}>
              <Link href={`/brands/${b.slug}`} className="font-heading text-2xl font-semibold tracking-tight text-forest-900/40 transition-colors hover:text-forest-900">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Closing lime band: the one big call to action. */
export function CtaBand({ cta, brand }: { cta: SiteHome["ctaBand"]; brand: SiteBrand }) {
  return (
    <section className="frame mb-4 bg-lime-400 text-forest-950">
      <div className="container-site grid items-center gap-10 py-16 lg:grid-cols-[1.4fr_1fr] lg:py-20">
        <div className="reveal">
          <Tag className="border-forest-950/20 bg-transparent text-forest-950/70">B2B pricing</Tag>
          <h2 className="mt-5 max-w-2xl text-h2">{cta.title}</h2>
          {cta.text && <p className="mt-5 max-w-xl text-lead text-forest-950/75">{cta.text}</p>}
        </div>
        <div className="reveal flex flex-wrap gap-3 lg:justify-end">
          <Action href="/quote" variant="dark" size="lg">
            {brand.ctaLabel}
          </Action>
          <Action href="/contact" variant="outline" size="lg" arrow={false} className="border-forest-950/20 bg-transparent hover:bg-white/40">
            Talk to sales
          </Action>
        </div>
      </div>
    </section>
  );
}
