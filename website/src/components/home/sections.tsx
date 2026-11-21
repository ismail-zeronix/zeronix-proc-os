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
import { cn } from "@/lib/utils";
import { type CategoryCardData, CategoryIcons } from "./category-icons";
import { ProductRail } from "./product-rail";
import { ShelfHeading } from "./shelf-heading";

/**
 * Home page sections in the noon.com pattern: the page is light grey and every section is a white panel. On phones a
 * panel runs edge to edge with a small grey gap between panels; from `sm` it is a rounded panel inside the page width.
 */
export function Panel({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={cn("container-site mt-2 scroll-mt-28 sm:mt-3", className)}>
      <div className="-mx-3 bg-white px-3 py-4 sm:mx-0 sm:rounded-xl sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}

/** "Shop by category" right under the hero: icon circles, no photos. */
export function CategoryTiles({ cards, ctaLabel }: { cards: CategoryCardData[]; ctaLabel: string }) {
  if (!cards.length) return null;
  return (
    <Panel>
      {/* desktop: a plain strip under the banners, as in the reference; phones keep the heading */}
      <div className="lg:hidden">
        <ShelfHeading title="Shop by category" href="/products" linkLabel="View all" />
      </div>
      <CategoryIcons cards={cards} ctaLabel={ctaLabel} />
    </Panel>
  );
}

export function Featured({ featured, products }: { featured: SiteHome["featured"]; products: SiteProductSummary[] }) {
  if (!products.length) return null;
  return (
    <Panel>
      <ShelfHeading title={featured.title} lead={featured.text} href="/products" linkLabel="View all" />
      <ProductRail products={products} label={featured.title} />
    </Panel>
  );
}

/** One category's products as a sideways rail, with "view all" to the category page. */
export function CategoryShelf({ category, products }: { category: SiteNavLink; products: SiteProductSummary[] }) {
  if (!products.length) return null;
  return (
    <Panel>
      <ShelfHeading title={category.name} lead={category.summary} href={`/products/${category.slug}`} linkLabel="View all" />
      <ProductRail products={products} label={category.name} />
    </Panel>
  );
}

/** Industries as small photo tiles: a sideways row on phones, six across on desktop. */
export function Industries({ industries }: { industries: SiteIndustryCard[] }) {
  if (!industries.length) return null;
  return (
    <Panel id="industries">
      <ShelfHeading title="Shop by industry" lead="IT matched to the way each kind of business works." href="/industries" linkLabel="View all" />
      <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-3 lg:overflow-visible lg:px-0">
        {industries.slice(0, 6).map((x) => (
          <li key={x.slug} className="w-32 sm:w-44 lg:w-auto">
            <Link href={`/industries/${x.slug}`} className="group block">
              <span className="block overflow-hidden rounded-lg">
                <Photo src={x.image?.src ?? imageFor(`industry-${x.slug}`)} subject={`${x.name}: ${x.summary}`} ratio="4:3" sizes="(min-width: 1024px) 200px, 140px" />
              </span>
              <span className="block pt-1.5 text-xs leading-snug font-medium text-ink group-hover:text-brand-900 sm:text-sm">{x.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** A slim green banner for ready-to-work bundles. */
export function BundlesBand({ bundles }: { bundles: SiteHome["bundles"] }) {
  if (!bundles.title) return null;
  return (
    <section className="container-site mt-2 sm:mt-3">
      <div className="flex flex-col gap-3 rounded-xl bg-brand-900 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-xl">{bundles.title}</h2>
          {bundles.text && <p className="mt-0.5 text-sm text-white/85">{bundles.text}</p>}
        </div>
        {bundles.cta && (
          <Action href={bundles.href || "/quote"} variant="light" className="self-start sm:self-auto" track="home-bundles">
            {bundles.cta}
          </Action>
        )}
      </div>
    </section>
  );
}

/**
 * IT services as an even grid of the service artwork. Each picture already carries its own title, so the card is the
 * picture alone (the name is the link's accessible label). A service with no picture yet gets a green card with the
 * title and icon. A sideways row on phones, four across from `lg`.
 */
export function ServicesBento({ services }: { services: SiteHome["services"] }) {
  if (!services.length) return null;
  return (
    <Panel>
      <ShelfHeading title="IT services" lead="Build, secure and run your office IT with one team." href="/services" linkLabel="View all" />
      <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:px-0">
        {services.map((s, i) => {
          const photo = imageFor(`service-${s.href.split("/").pop()}`);
          return (
            <RiseItem key={s.href} index={i % 4} className="w-[72%] sm:w-[46%] lg:w-auto">
              <Link href={s.href} aria-label={s.label} className="group relative block aspect-video overflow-hidden rounded-lg bg-brand-900 transition-shadow duration-300 hover:shadow-lift">
                {photo ? (
                  <Image src={photo} alt={`${s.label} for UAE businesses`} fill sizes="(min-width: 1024px) 25vw, 72vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                ) : (
                  <span className="absolute inset-0 flex flex-col justify-between p-4 text-white sm:p-5">
                    <span className="max-w-[70%] font-heading text-[0.9375rem] leading-tight font-semibold sm:text-lg">{s.label}</span>
                    <SiteIconView name={s.icon} className="size-9 self-end text-highlight" strokeWidth={1.5} />
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
    </Panel>
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
    <Panel>
      <div className="grid gap-4 lg:grid-cols-[1fr_2.4fr] lg:items-center lg:gap-10">
        <div className="grid gap-2 sm:gap-3">
          <h2 className="text-h2 text-ink">How B2B buying works</h2>
          <p className="text-sm text-muted-ink">Three steps from a question to working devices on every desk.</p>
          <Action href="/quote" variant="dark" className="mt-1 justify-self-start" track="home-steps">
            {ctaLabel}
          </Action>
        </div>
        <ol className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-lg bg-surface-soft p-3.5 sm:grid sm:content-start sm:gap-2 sm:p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-900 text-sm font-semibold text-white">{i + 1}</span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold text-ink">{s.title}</span>
                <span className="text-[0.8125rem] text-muted-ink sm:text-sm">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

/** The latest buying guides: the content that answers "which laptop for my team". */
export function LatestGuides({ posts }: { posts: SitePostSummary[] }) {
  if (!posts.length) return null;
  return (
    <Panel>
      <ShelfHeading title="Buying guides" lead="Plain-English advice on choosing IT for your kind of business." href="/guides" linkLabel="View all" />
      <PostGrid posts={posts.slice(0, 3)} />
    </Panel>
  );
}

/**
 * Why buy here: the reasons as icon rows and the key numbers in green. A number about brands is the real count of
 * published brands, so it never disagrees with the brand list.
 */
export function WhyUs({ brand, home, brandCount = 0 }: { brand: SiteBrand; home: SiteHome; brandCount?: number }) {
  if (!home.reasons.length && !home.stats.length) return null;
  return (
    <Panel>
      <h2 className="text-h2 text-ink">Why {brand.name}</h2>
      {home.reasons.length > 0 && (
        <ul className="mt-3 grid gap-2.5 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          {home.reasons.map((r) => (
            <li key={r.title} className="flex gap-3 rounded-lg bg-surface-soft p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-brand-900">
                <SiteIconView name={r.icon} className="size-4" strokeWidth={2} />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold text-ink">{r.title}</span>
                <span className="text-xs leading-relaxed text-muted-ink">{r.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {home.stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          {home.stats.map((s) => (
            <div key={s.label} className="flex flex-col-reverse">
              <dt className="text-xs text-muted-ink">{s.label}</dt>
              <dd className="font-heading text-xl font-bold tracking-tight text-brand-900 sm:text-3xl">{brandCount > 0 && /\bbrands?\b/i.test(s.label) ? String(brandCount) : s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

/** Brands as name tiles (no trademark artwork): a sideways row on phones, a wrapped row on desktop. */
export function Brands({ brands }: { brands: SiteNavLink[] }) {
  if (!brands.length) return null;
  return (
    <Panel>
      <ShelfHeading title="Shop by brand" href="/products" linkLabel="View all" />
      <ul className="scroll-row lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {brands.map((b) => (
          <li key={b.slug}>
            <Link href={`/brands/${b.slug}`} className="grid h-12 min-w-24 place-items-center rounded-lg border border-line px-4 font-heading text-[0.9375rem] font-semibold tracking-tight text-ink transition-colors hover:border-brand-900 hover:text-brand-900 sm:h-14 sm:min-w-32 sm:text-base">
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
