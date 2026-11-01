import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Action, Tag } from "@/components/brand/action";
import { ProductCard } from "@/components/brand/cards";
import { Photo } from "@/components/brand/photo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { SiteFaqItem, SiteProductSummary } from "@/lib/contract";
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
 * Header of an inner page: a sage frame with breadcrumbs, tag, title and lead, and a photo on the right when there is
 * one (or a labelled slot when `photoSubject` is given).
 */
export function PageHero({
  crumbs,
  tag,
  title,
  lead,
  photo,
  photoSubject,
  actions,
}: {
  crumbs: Crumb[];
  tag?: string;
  title: string;
  lead?: string;
  photo?: string;
  photoSubject?: string;
  actions?: React.ReactNode;
}) {
  const withPhoto = Boolean(photo || photoSubject);
  return (
    <section className="frame mt-2 bg-sage-100">
      <div className={cn("container-site grid gap-10 py-12 sm:py-16", withPhoto && "items-center lg:grid-cols-[1.1fr_1fr]")}>
        <div className="grid content-start gap-6">
          <Breadcrumbs items={crumbs} />
          {tag && <Tag>{tag}</Tag>}
          <h1 className="text-display text-ink">{title}</h1>
          {lead && <p className="max-w-xl text-lead text-muted-ink">{lead}</p>}
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>
        {withPhoto && <Photo src={photo} subject={photoSubject ?? title} ratio="4:3" priority sizes="(min-width: 1024px) 45vw, 100vw" className="rounded-card" />}
      </div>
    </section>
  );
}

export function ProductTile({ p, label }: { p: SiteProductSummary; label?: string }) {
  return (
    <div className="relative h-full">
      {label && <span className="absolute top-4 left-4 z-10 rounded-full bg-lime-400 px-2.5 py-1 text-xs font-semibold text-forest-950">{label}</span>}
      <ProductCard href={`/products/${p.categorySlug}/${p.slug}`} brand={p.brand || p.category} name={p.name} specs={p.keySpecs} photo={p.image?.src} />
    </div>
  );
}

export function ProductGrid({ products, labels }: { products: SiteProductSummary[]; labels?: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    <section className="container-site grid gap-10 py-20 lg:grid-cols-[1fr_1.6fr]">
      <div className="reveal">
        <Tag>FAQ</Tag>
        <h2 className="mt-5 text-h2">{title}</h2>
      </div>
      <Accordion className="rounded-card bg-white px-6">
        {items.map((f, i) => (
          <AccordionItem key={f.q} value={`q${i}`}>
            <AccordionTrigger className="py-5 text-base font-semibold">{f.q}</AccordionTrigger>
            <AccordionContent className="pb-5 text-muted-ink">{f.a}</AccordionContent>
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

/** The B2B action strip at the end of catalog pages: forest frame, the action already filled in for this page. */
export function CtaStrip({ title, text, quoteHref, label }: { title: string; text: string; quoteHref: string; label: string }) {
  return (
    <section className="frame mb-4 bg-forest-900 text-white">
      <div className="container-site flex flex-col gap-8 py-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <Tag onDark>B2B pricing</Tag>
          <h2 className="mt-5 text-h2 text-white">{title}</h2>
          <p className="mt-4 text-lead text-white/70">{text}</p>
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
