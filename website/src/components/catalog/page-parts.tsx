import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Action, Tag } from "@/components/brand/action";
import { ProductCard } from "@/components/brand/cards";
import { GRID_COLS } from "@/components/brand/skeleton";
import { Photo } from "@/components/brand/photo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { SiteFaqItem, SiteProductSummary } from "@/lib/contract";
import { formatPrice } from "@/lib/price";
import { SITE_URL } from "@/lib/defaults";
import { cn } from "@/lib/utils";

/** Pieces every catalog page shares (BRAND.md components, nothing one-off). */

/** Structured data for search engines. `<` is escaped so text from the catalog can never close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export type Crumb = { href: string; label: string };

export function Breadcrumbs({ items, onDark = false }: { items: Crumb[]; onDark?: boolean }) {
  const all = [{ href: "/", label: "Home" }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className={cn("flex flex-wrap items-center gap-1 text-sm", onDark ? "text-white/60" : "text-muted-ink")}>
          {all.map((c, i) => (
            <li key={c.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 opacity-60" aria-hidden />}
              {i === all.length - 1 ? (
                <span aria-current="page" className={onDark ? "text-white" : "text-ink"}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${SITE_URL}${c.href}` })),
        }}
      />
    </>
  );
}

/**
 * Header of an inner page: a surface frame with breadcrumbs, tag, title and lead, and a photo on the right when there is
 * one (or a labelled slot when `photoSubject` is given). `mosaic`: four product pictures on white tiles instead, for a
 * category that has no photo of its own.
 */
export function PageHero({
  crumbs,
  tag,
  title,
  lead,
  photo,
  photoSubject,
  mosaic,
  actions,
}: {
  crumbs: Crumb[];
  tag?: string;
  title: string;
  lead?: string;
  photo?: string;
  photoSubject?: string;
  mosaic?: string[];
  actions?: React.ReactNode;
}) {
  const tiles = !photo && mosaic && mosaic.length >= 4 ? mosaic.slice(0, 4) : null;
  const withPhoto = Boolean(photo || photoSubject || tiles);
  return (
    <section className="frame mt-2 bg-surface">
      <div className={cn("container-site grid gap-6 py-6 sm:py-8", withPhoto && "items-center lg:grid-cols-[1.4fr_1fr]")}>
        <div className="grid content-start gap-3 sm:gap-4">
          <Breadcrumbs items={crumbs} />
          {tag && <Tag>{tag}</Tag>}
          <h1 className="text-2xl leading-tight font-medium tracking-tight text-ink sm:text-3xl">{title}</h1>
          {lead && <p className="max-w-xl text-lead text-muted-ink">{lead}</p>}
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>
        {tiles ? (
          <div className="hidden grid-cols-4 gap-2 lg:grid">
            {tiles.map((src, i) => (
              <Photo key={src} src={src} subject={title} ratio="1:1" priority={i === 0} sizes="120px" className="rounded-inner bg-white [&_img]:object-contain [&_img]:p-2" />
            ))}
          </div>
        ) : (
          withPhoto && (
            <div className="hidden lg:block">
              <Photo src={photo} subject={photoSubject ?? title} ratio="21:9" priority sizes="40vw" className="rounded-card" />
            </div>
          )
        )}
      </div>
    </section>
  );
}

export function ProductTile({ p, label }: { p: SiteProductSummary; label?: string }) {
  return (
    <div className="relative h-full">
      {label && <span className="absolute top-3 left-3 z-10 rounded-full bg-cta px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-950">{label}</span>}
      <ProductCard href={`/products/${p.categorySlug}/${p.slug}`} brand={p.brand || p.category} name={p.name} specs={p.keySpecs} photo={p.image?.src} price={formatPrice(p.price, p.currency)} buy={p.price} mpn={p.mpn} stock={p.availability} />
    </div>
  );
}

export function ProductGrid({ products, labels, cols = GRID_COLS }: { products: SiteProductSummary[]; labels?: Record<string, string>; cols?: string }) {
  return (
    <div className={cols}>
      {products.map((p) => (
        <ProductTile key={p.slug} p={p} label={labels?.[p.slug]} />
      ))}
    </div>
  );
}

/** Questions as an accordion, plus FAQPage data for Google. */
export function Faq({ items, title = "Questions we get asked" }: { items: SiteFaqItem[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="container-site grid gap-4 py-8 sm:py-10 lg:grid-cols-[1fr_2fr] lg:gap-8">
      <h2 className="text-h2">{title}</h2>
      <Accordion className="rounded-card border border-line/70 bg-white px-4 sm:px-5">
        {items.map((f, i) => (
          <AccordionItem key={f.q} value={`q${i}`}>
            <AccordionTrigger className="py-3.5 text-sm font-semibold sm:text-[0.9375rem]">{f.q}</AccordionTrigger>
            <AccordionContent className="pb-4 text-muted-ink">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
    </section>
  );
}

/** The B2B action strip at the end of catalog pages: navy frame, the action already filled in for this page. */
export function CtaStrip({ title, text, quoteHref, label }: { title: string; text: string; quoteHref: string; label: string }) {
  return (
    <section className="frame mb-4 bg-brand-900 text-white">
      <div className="container-site flex flex-col gap-5 py-8 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-h2 text-white">{title}</h2>
          <p className="mt-2 text-white/70">{text}</p>
        </div>
        <Action href={quoteHref} size="lg" track="cta-strip">
          {label}
        </Action>
      </div>
    </section>
  );
}

/** The quote form's link, filled in with what the visitor was looking at (WEBSITE-PLAN.md section 7). */
export function quoteLink(p: { industry?: string; product?: string; category?: string }) {
  const q = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => Boolean(e[1])));
  return `/quote${q.size ? `?${q}` : ""}`;
}
