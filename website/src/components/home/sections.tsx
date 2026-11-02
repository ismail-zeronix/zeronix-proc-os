import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import type { SiteBrand, SiteHome, SiteIndustryCard, SiteNavLink } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";
import { FeaturedShelf, type Shelf } from "./featured";

/** Home page sections, store-style: small headings, tight spacing, rows that scroll sideways on phones (BRAND.md colours). */

/** Section header row: title (a short lime rule in front), an optional line under it, and "view all" on the right. */
function ShelfHeading({ title, lead, href, linkLabel }: { title: string; lead?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 sm:mb-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-h2 text-ink">
          <span aria-hidden className="h-1 w-6 shrink-0 rounded-full bg-lime-400" />
          {title}
        </h2>
        {lead && <p className="mt-1 hidden text-sm text-muted-ink sm:block">{lead}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-forest-800 hover:text-forest-950 sm:text-sm">
          {linkLabel} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

const section = "container-site py-4 sm:py-5";

/** Category tiles right under the hero: a sideways row on phones, a grid on desktop. Photo when there is one, else the icon. */
export function CategoryTiles({ categories }: { categories: SiteNavLink[] }) {
  if (!categories.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title="Shop by category" href="/products" linkLabel="All products" />
      <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] lg:gap-3 lg:overflow-visible lg:px-0">
        {categories.map((c) => {
          const photo = imageFor(`category-${c.slug}`);
          return (
            <li key={c.slug} className="w-24 sm:w-28 lg:w-auto">
              <Link href={`/products/${c.slug}`} className="group flex h-full flex-col items-center gap-2 rounded-card border border-line/70 bg-white p-2 pb-2.5 text-center transition-colors hover:border-forest-900">
                {photo ? (
                  <Photo src={photo} subject={c.name} ratio="1:1" sizes="120px" className="w-full" />
                ) : (
                  <span className="grid aspect-square w-full place-items-center rounded-inner bg-sage-50 text-forest-800 transition-colors group-hover:bg-sage-100">
                    <SiteIconView name={c.icon} className="size-8" strokeWidth={1.25} />
                  </span>
                )}
                <span className="line-clamp-2 text-xs leading-snug font-semibold text-ink">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Featured({ featured, shelves }: { featured: SiteHome["featured"]; shelves: Shelf[] }) {
  const withProducts = shelves.filter((s) => s.products.length);
  if (!withProducts.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title={featured.title} lead={featured.text} href="/products" linkLabel="View all" />
      <FeaturedShelf shelves={withProducts} />
    </section>
  );
}

/** Industries as small photo tiles: a sideways row on phones, six across on desktop. */
export function Industries({ industries }: { industries: SiteIndustryCard[] }) {
  if (!industries.length) return null;
  return (
    <section id="industries" className={`${section} scroll-mt-28`}>
      <ShelfHeading title="Shop by industry" lead="IT matched to the way each kind of business works." href="/industries" linkLabel="All industries" />
      <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-3 lg:overflow-visible lg:px-0">
        {industries.slice(0, 6).map((x) => (
          <li key={x.slug} className="w-36 sm:w-44 lg:w-auto">
            <Link href={`/industries/${x.slug}`} className="group block rounded-card border border-line/70 bg-white p-1.5 transition-colors hover:border-forest-900">
              <Photo src={x.image?.src ?? imageFor(`industry-${x.slug}`)} subject={`${x.name}: ${x.summary}`} ratio="4:3" sizes="(min-width: 1024px) 200px, 160px" />
              <span className="block px-1.5 pt-2 pb-1 text-xs leading-snug font-semibold text-ink sm:text-sm">{x.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A slim forest band for ready-to-work bundles. */
export function BundlesBand({ bundles }: { bundles: SiteHome["bundles"] }) {
  if (!bundles.title) return null;
  return (
    <section className={section}>
      <div className="flex flex-col gap-3 rounded-frame bg-forest-900 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold sm:text-xl">{bundles.title}</h2>
          {bundles.text && <p className="mt-0.5 text-sm text-white/70">{bundles.text}</p>}
        </div>
        {bundles.cta && (
          <Action href={bundles.href || "/quote"} className="self-start sm:self-auto" track="home-bundles">
            {bundles.cta}
          </Action>
        )}
      </div>
    </section>
  );
}

/** IT services as small icon tiles: a sideways row on phones, eight across on desktop. */
export function Services({ services }: { services: SiteHome["services"] }) {
  if (!services.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title="IT services" lead="Build, secure and run your office IT with one team." href="/services" linkLabel="All services" />
      <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-8 lg:gap-3 lg:overflow-visible lg:px-0">
        {services.map((s) => (
          <li key={s.href} className="w-28 lg:w-auto">
            <Link href={s.href} className="group flex h-full flex-col items-center gap-2 rounded-card border border-line/70 bg-white px-2 py-3.5 text-center transition-colors hover:border-forest-900">
              <span className="grid size-10 place-items-center rounded-full bg-sage-100 text-forest-900 transition-colors group-hover:bg-lime-400 group-hover:text-forest-950">
                <SiteIconView name={s.icon} className="size-5" strokeWidth={1.75} />
              </span>
              <span className="text-xs leading-snug font-semibold text-ink">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Why buy here: the reasons and the key numbers in one compact forest band. */
export function WhyUs({ brand, home }: { brand: SiteBrand; home: SiteHome }) {
  if (!home.reasons.length && !home.stats.length) return null;
  return (
    <section className={section}>
      <div className="rounded-frame bg-forest-900 p-5 text-white sm:p-7">
        <h2 className="text-h2 text-white">Why {brand.name}</h2>
        {home.reasons.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {home.reasons.map((r) => (
              <li key={r.title} className="flex gap-3 rounded-card bg-forest-800/70 p-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-forest-950/60 text-mint-300">
                  <SiteIconView name={r.icon} className="size-4" strokeWidth={1.75} />
                </span>
                <span className="grid gap-0.5">
                  <span className="text-sm font-semibold">{r.title}</span>
                  <span className="text-xs leading-relaxed text-white/65">{r.text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {home.stats.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
            {home.stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse">
                <dt className="text-xs text-white/60">{s.label}</dt>
                <dd className="font-heading text-2xl font-medium tracking-tight text-white sm:text-3xl">{s.value}</dd>
              </div>
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
    <section className={section}>
      <div className="flex flex-col gap-3 rounded-card border border-line/70 bg-white px-5 py-4 sm:flex-row sm:items-center sm:gap-8">
        <span className="shrink-0 text-xs font-semibold tracking-[0.12em] text-muted-ink uppercase">Brands</span>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-2">
          {brands.map((b) => (
            <li key={b.slug}>
              <Link href={`/brands/${b.slug}`} className="font-heading text-lg font-semibold tracking-tight text-forest-900/45 transition-colors hover:text-forest-900">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Closing lime band: the one big call to action, kept slim. */
export function CtaBand({ cta, brand }: { cta: SiteHome["ctaBand"]; brand: SiteBrand }) {
  return (
    <section className="container-site pt-2 pb-6 sm:pb-8">
      <div className="flex flex-col gap-4 rounded-frame bg-lime-400 px-5 py-6 text-forest-950 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-h2">{cta.title}</h2>
          {cta.text && <p className="mt-1 max-w-2xl text-sm text-forest-950/75">{cta.text}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Action href="/quote" variant="dark" track="home-cta">
            {brand.ctaLabel}
          </Action>
          <Action href="/contact" variant="outline" arrow={false} className="border-forest-950/20 bg-transparent hover:bg-white/40">
            Talk to sales
          </Action>
        </div>
      </div>
    </section>
  );
}
