import { Check, ExternalLink, Keyboard, Minus, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Action, ArrowCircle, SectionHeading, Tag } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import { Breadcrumbs, CtaStrip, Faq, JsonLd, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { SpecTable } from "@/components/catalog/spec-table";
import { AddToQuote } from "@/components/quote/quote-buttons";
import { ChatNowButton } from "@/components/quote/chat-now";
import { getProduct, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/products/[category]/[slug]">): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return {};
  const specs = p.keySpecs.join(", ");
  return {
    title: p.seo.title || `${p.name}${p.mpn ? ` (${p.mpn})` : ""} for business in the UAE`,
    description: p.seo.description || `${p.name}${specs ? `: ${specs}` : ""}. UAE stock, local warranty, B2B pricing from ${p.brand || "Zeronix Tech"}.`,
    alternates: { canonical: `/products/${p.categorySlug}/${p.slug}` },
    openGraph: { images: p.image ? [p.image.src] : undefined },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[category]/[slug]">) {
  const { category, slug } = await params;
  const [p, { brand }] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p) notFound();
  // one address per product: a wrong category in the link moves to the right one
  if (p.categorySlug !== category) permanentRedirect(`/products/${p.categorySlug}/${p.slug}`);
  const quote = quoteLink({ product: p.slug });
  const url = `${SITE_URL}/products/${p.categorySlug}/${p.slug}`;
  const facts = [
    p.uae.keyboard && { icon: Keyboard, label: "Keyboard", value: p.uae.keyboard },
    p.uae.warranty && { icon: ShieldCheck, label: "Warranty", value: p.uae.warranty },
    p.uaeAvailable && { icon: Truck, label: "Availability", value: "UAE stock, delivered across the Emirates" },
  ].filter(Boolean) as { icon: typeof Keyboard; label: string; value: string }[];

  return (
    <>
      <section className="container-site pt-8 pb-16">
        <Breadcrumbs
          items={[
            { href: "/products", label: "Products" },
            { href: `/products/${p.categorySlug}`, label: p.category },
            { href: `/products/${p.categorySlug}/${p.slug}`, label: p.name },
          ]}
        />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
          <div className="grid content-start gap-3">
            <div className="rounded-frame bg-white p-3">
              <Photo src={p.images[0]?.src} subject={`${p.name}: product shot on sage, three-quarter view`} ratio="4:3" priority sizes="(min-width: 1024px) 50vw, 100vw" className="rounded-card" />
            </div>
            {p.images.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {p.images.slice(1, 5).map((img) => (
                  <Photo key={img.src} src={img.src} subject={img.alt} ratio="4:3" sizes="12vw" />
                ))}
              </div>
            )}
          </div>

          <div className="grid content-start gap-6">
            <div className="flex flex-wrap gap-2">
              {p.brand && <Tag>{p.brand}</Tag>}
              <Tag>{p.category}</Tag>
            </div>
            <h1 className="text-h2 text-ink">{p.name}</h1>
            {p.mpn && <p className="text-sm text-muted-ink">Part number (UAE): <span className="font-medium text-ink">{p.mpn}</span></p>}
            {p.keySpecs.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {p.keySpecs.map((s) => (
                  <li key={s} className="rounded-full bg-sage-100 px-3 py-1.5 text-sm text-forest-900">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {p.highlights.length > 0 && (
              <ul className="grid gap-2.5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-lime-400 text-forest-950">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-card bg-forest-900 p-6 text-white">
              <p className="text-sm text-white/60">Price</p>
              <p className="mt-1 font-heading text-2xl font-medium">B2B price on request</p>
              <p className="mt-1 text-sm text-white/60">Volume pricing for your quantity, with a VAT invoice.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Action href={quote}>Get B2B price</Action>
                <AddToQuote slug={p.slug} name={p.name} label className="border-white/20 text-white hover:border-lime-400" />
                {p.related[0] && (
                  <Action href={`/compare/${p.slug}-vs-${p.related[0].slug}`} variant="onDark" arrow={false}>
                    Compare
                  </Action>
                )}
              </div>
              <ChatNowButton message={`Hi, I'm looking for B2B pricing on the ${p.name}.`} context={{ product: p.slug, category: p.categorySlug, cta: "Product page" }} className="mt-3 bg-white/10 hover:bg-white/15" />
            </div>
            {facts.length > 0 && (
              <dl className="grid gap-3 sm:grid-cols-3">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-card bg-white p-4">
                    <f.icon className="size-5 text-forest-700" strokeWidth={1.75} />
                    <dt className="mt-3 text-xs text-muted-ink">{f.label}</dt>
                    <dd className="text-sm font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>

      {p.bestFor.length > 0 && (
        <section className="container-site pb-16">
          <h2 className="text-xl font-semibold">Best for</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.bestFor.map((b) => (
              <Link key={`${b.industrySlug}${b.role}`} href={`/industries/${b.industrySlug}`} className="group flex items-center justify-between gap-4 rounded-card bg-white p-5 transition-shadow hover:shadow-lift">
                <span className="grid">
                  {b.label && <span className="text-xs font-semibold tracking-[0.12em] text-forest-700 uppercase">{b.label}</span>}
                  <span className="font-semibold">{b.industry}</span>
                  {b.role && <span className="text-sm text-muted-ink">{b.role}</span>}
                </span>
                <ArrowCircle />
              </Link>
            ))}
          </div>
        </section>
      )}

      {(p.summaryHtml || p.pros.length > 0 || p.cons.length > 0) && (
        <section className="bg-sage-50 py-8 sm:py-10">
          <div className="container-site grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            {p.summaryHtml ? <div className="prose prose-lg max-w-none prose-headings:font-heading prose-headings:font-medium prose-a:text-forest-700" dangerouslySetInnerHTML={{ __html: p.summaryHtml }} /> : <div />}
            <div className="grid content-start gap-4">
              {p.pros.length > 0 && (
                <div className="rounded-card bg-white p-6">
                  <h2 className="font-semibold">Why we like it</h2>
                  <ul className="mt-4 grid gap-2.5">
                    {p.pros.map((x) => (
                      <li key={x} className="flex gap-3 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-forest-700" /> {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.cons.length > 0 && (
                <div className="rounded-card bg-white p-6">
                  <h2 className="font-semibold">Worth knowing</h2>
                  <ul className="mt-4 grid gap-2.5">
                    {p.cons.map((x) => (
                      <li key={x} className="flex gap-3 text-sm">
                        <Minus className="mt-0.5 size-4 shrink-0 text-muted-ink" /> {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section id="specs" className="container-site py-8 sm:py-10">
        <SectionHeading tag="Specifications" title="Full specifications" />
        <div className="mt-5">
          <SpecTable groups={p.specGroups} />
        </div>
        {p.sourceUrl && (
          <p className="mt-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-ink">
            Specifications from the
            <a href={p.sourceUrl} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-forest-700 hover:underline">
              brand&apos;s page <ExternalLink className="size-3.5" />
            </a>
            {p.specsCheckedAt && <>, checked {new Date(p.specsCheckedAt).toLocaleDateString("en-AE", { month: "long", year: "numeric" })}</>}. Configurations can change; we confirm them on your quote.
          </p>
        )}
      </section>

      <Faq items={p.faq} title={`About the ${p.name}`} />

      {p.related.length > 0 && (
        <section className="container-site pb-20">
          <SectionHeading tag="Related" title={`More ${p.category.toLowerCase()}`} />
          <div className="mt-5">
            <ProductGrid products={p.related} />
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {p.related.slice(0, 3).map((r) => (
              <Link key={r.slug} href={`/compare/${p.slug}-vs-${r.slug}`} className="rounded-full border border-line bg-white px-4 py-2 text-sm hover:border-forest-700/40">
                Compare with {r.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <CtaStrip title={`Need the ${p.name} for your team?`} text="Tell us how many and where. We reply with B2B pricing and delivery time, usually within a working day." quoteHref={quote} label={brand.ctaLabel} />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          sku: p.mpn || undefined,
          mpn: p.mpn || undefined,
          brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
          category: p.category,
          image: p.images.map((i) => `${SITE_URL}${i.src}`),
          url,
          description: p.highlights.join(". ") || undefined,
          additionalProperty: p.specGroups.flatMap((g) => g.rows.map((r) => ({ "@type": "PropertyValue", name: r.label, value: r.value }))),
        }}
      />
    </>
  );
}
