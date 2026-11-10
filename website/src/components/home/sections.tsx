import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import { PostGrid } from "@/components/content/post-card";
import type { SiteBrand, SiteHome, SiteIndustryCard, SiteNavLink, SitePostSummary, SiteProductSummary } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";
import { RiseItem } from "@/components/motion/motion";
import { type CategoryCardData, CategoryRail } from "./category-rail";
import { ProductRail } from "./product-rail";
import { ShelfHeading } from "./shelf-heading";

/** Home page sections, store-style: small headings, tight spacing, rows that scroll sideways on phones (BRAND.md colours). */

const section = "container-site py-4 sm:py-5";

/** "Shop by category" right under the hero: categories, then brand picks, in one sideways row (CategoryRail). */
export function CategoryTiles({ cards }: { cards: CategoryCardData[] }) {
  if (!cards.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title="Shop by category" href="/products" linkLabel="All products" />
      <CategoryRail cards={cards} />
    </section>
  );
}

export function Featured({ featured, products }: { featured: SiteHome["featured"]; products: SiteProductSummary[] }) {
  if (!products.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title={featured.title} lead={featured.text} href="/products" linkLabel="View all" />
      <ProductRail products={products} label={featured.title} />
    </section>
  );
}

/** One category's products as a sideways rail, with "view all" to the category page. */
export function CategoryShelf({ category, products }: { category: SiteNavLink; products: SiteProductSummary[] }) {
  if (!products.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title={category.name} lead={category.summary} href={`/products/${category.slug}`} linkLabel="View all" />
      <ProductRail products={products} label={category.name} />
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
            <Link href={`/industries/${x.slug}`} className="group block rounded-card border border-line/70 bg-white p-1.5 transition-colors hover:border-brand-900">
              <Photo src={x.image?.src ?? imageFor(`industry-${x.slug}`)} subject={`${x.name}: ${x.summary}`} ratio="4:3" sizes="(min-width: 1024px) 200px, 160px" />
              <span className="block px-1.5 pt-2 pb-1 text-xs leading-snug font-semibold text-ink sm:text-sm">{x.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A slim navy band for ready-to-work bundles. */
export function BundlesBand({ bundles }: { bundles: SiteHome["bundles"] }) {
  if (!bundles.title) return null;
  return (
    <section className={section}>
      <div className="flex flex-col gap-3 rounded-frame bg-brand-900 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
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

/**
 * IT services as an even grid of the service artwork. Each picture already carries its own title, so the card is the
 * picture alone (the name is the link's accessible label) and nothing is written twice. A service with no picture yet
 * gets a navy card set in the same style: big white title, mint icon. A sideways row on phones (the artwork's own
 * words would be too small in two columns), four across from `lg`.
 */
export function ServicesBento({ services }: { services: SiteHome["services"] }) {
  if (!services.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title="IT services" lead="Build, secure and run your office IT with one team." href="/services" linkLabel="All services" />
      <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:px-0">
        {services.map((s, i) => {
          const photo = imageFor(`service-${s.href.split("/").pop()}`);
          return (
            <RiseItem key={s.href} index={i % 4} className="w-[78%] sm:w-[46%] lg:w-auto">
              <Link href={s.href} aria-label={s.label} className="group relative block aspect-video overflow-hidden rounded-card bg-brand-900 ring-1 ring-line/70 transition-shadow duration-300 hover:shadow-lift">
                {photo ? (
                  <>
                    <Image src={photo} alt={`${s.label} for UAE businesses`} fill sizes="(min-width: 1024px) 25vw, 78vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                    {/* the artwork was made for the old green theme: a hue blend turns its greens navy and keeps the
                        light and dark of the picture (so its own titles stay readable) until navy artwork replaces it */}
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-brand-700 mix-blend-hue" />
                  </>
                ) : (
                  <span className="absolute inset-0 flex flex-col justify-between p-4 text-white sm:p-5">
                    <span className="grid max-w-[70%] gap-2.5">
                      <span className="font-heading text-lg leading-tight font-bold sm:text-xl">{s.label}</span>
                      <span aria-hidden className="h-1 w-9 rounded-full bg-cta" />
                    </span>
                    <SiteIconView name={s.icon} className="size-10 self-end text-highlight" strokeWidth={1.25} />
                  </span>
                )}
                <span className="absolute right-2.5 bottom-2.5 grid size-8 place-items-center rounded-full bg-white text-brand-900 opacity-0 shadow-lift transition-all duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </RiseItem>
          );
        })}
      </ul>
    </section>
  );
}

/** B2B buying in three steps, so a first-time company buyer knows what happens after they ask. */
export function HowItWorks({ ctaLabel }: { ctaLabel: string }) {
  const steps = [
    { title: "Tell us what you need", text: "Send a quote list, part numbers or just the team size and the work they do." },
    { title: "Get B2B pricing", text: "A written quote with UAE stock, warranty details and a VAT invoice." },
    { title: "Delivered and set up", text: "Delivery across the UAE, with setup and ongoing support if you want it." },
  ];
  return (
    <section className={section}>
      <div className="grid gap-5 rounded-frame border border-line/70 bg-white p-5 sm:p-7 lg:grid-cols-[1fr_2.4fr] lg:items-center lg:gap-10">
        <div className="grid gap-3">
          <h2 className="flex items-center gap-2.5 text-h2 text-ink">
            <span aria-hidden className="h-1 w-6 shrink-0 rounded-full bg-cta" />
            How B2B buying works
          </h2>
          <p className="text-sm text-muted-ink">Three steps from a question to working devices on every desk.</p>
          <Action href="/quote" variant="dark" className="justify-self-start" track="home-steps">
            {ctaLabel}
          </Action>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3 sm:gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative grid content-start gap-2 rounded-card border border-line/70 bg-canvas p-4">
              <span className="font-heading text-3xl font-medium tracking-tight text-brand-700">0{i + 1}</span>
              <span className="text-[0.9375rem] font-semibold text-ink">{s.title}</span>
              <span className="text-sm text-muted-ink">{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The latest buying guides: the content that answers "which laptop for my team". */
export function LatestGuides({ posts }: { posts: SitePostSummary[] }) {
  if (!posts.length) return null;
  return (
    <section className={section}>
      <ShelfHeading title="Buying guides" lead="Plain-English advice on choosing IT for your kind of business." href="/guides" linkLabel="All guides" />
      <PostGrid posts={posts.slice(0, 3)} />
    </section>
  );
}

/**
 * Why buy here: the reasons and the key numbers in one compact navy band. A number about brands is the real count of
 * published brands, so it never disagrees with the brand list right under it.
 */
export function WhyUs({ brand, home, brandCount = 0 }: { brand: SiteBrand; home: SiteHome; brandCount?: number }) {
  if (!home.reasons.length && !home.stats.length) return null;
  return (
    <section className={section}>
      <div className="rounded-frame bg-brand-900 p-5 text-white sm:p-7">
        <h2 className="text-h2 text-white">Why {brand.name}</h2>
        {home.reasons.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {home.reasons.map((r) => (
              <li key={r.title} className="flex gap-3 rounded-card bg-brand-800/70 p-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-950/60 text-highlight">
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
                <dd className="font-heading text-2xl font-medium tracking-tight text-white sm:text-3xl">{brandCount > 0 && /\bbrands?\b/i.test(s.label) ? String(brandCount) : s.value}</dd>
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
              <Link href={`/brands/${b.slug}`} className="font-heading text-lg font-semibold tracking-tight text-brand-900/45 transition-colors hover:text-brand-900">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
