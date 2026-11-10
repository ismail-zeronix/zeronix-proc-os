import { ArrowDown, ArrowLeftRight, Check, ExternalLink, Keyboard, Minus, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Action, ArrowCircle, SectionHeading, Tag } from "@/components/brand/action";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { BuyBox } from "@/components/store/buy-box";
import { STOCK_SCHEMA } from "@/components/store/stock";
import { Breadcrumbs, CtaStrip, Faq, JsonLd, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { SpecTable } from "@/components/catalog/spec-table";
import { AddToQuote } from "@/components/quote/quote-buttons";
import { ChatNowButton } from "@/components/quote/chat-now";
import { getProduct, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { aboutModel, productDescription, productFaq, productTitle, shortName } from "@/lib/product-copy";

export const revalidate = 600;

const AVAILABILITY_TEXT = {
  in_stock: "UAE stock, delivered across the Emirates",
  ships_soon: "Ships in 2–5 days, delivered across the Emirates",
  on_order: "Ordered in for you; we confirm the date",
} as const;

export async function generateMetadata({ params }: PageProps<"/products/[category]/[slug]">): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return {};
  // short, part number first: competitors win "<model> price in UAE" searches with exactly this (website/SEO-STRATEGY.md)
  return {
    title: { absolute: productTitle(p) },
    description: productDescription(p),
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
  const sold = p.priceMode === "public" && Boolean(p.price);
  const about = p.summaryHtml ? [] : aboutModel(p);
  const faq = productFaq(p);
  const store = p.store;
  const facts = [
    p.uae.keyboard && { icon: Keyboard, label: "Keyboard", value: p.uae.keyboard },
    p.uae.warranty && { icon: ShieldCheck, label: "Warranty", value: p.uae.warranty },
    p.uaeAvailable && { icon: Truck, label: "Availability", value: AVAILABILITY_TEXT[p.priceMode === "public" ? p.availability : "in_stock"] },
  ].filter(Boolean) as { icon: typeof Keyboard; label: string; value: string }[];

  return (
    <>
      <section className="container-site pt-5 pb-10 sm:pt-6 sm:pb-12">
        <Breadcrumbs
          items={[
            { href: "/products", label: "Products" },
            { href: `/products/${p.categorySlug}`, label: p.category },
            { href: `/products/${p.categorySlug}/${p.slug}`, label: p.name },
          ]}
        />
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start">
            <ProductGallery images={p.images} name={p.name} />
          </div>

          {/* desktop: the details and buy box stay in view while the gallery column scrolls */}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 lg:sticky lg:top-28 lg:self-start">
            <div className="flex flex-wrap gap-2">
              {p.brand && <Tag>{p.brand}</Tag>}
              <Tag>{p.category}</Tag>
            </div>
            <h1 className="text-h2 break-words text-ink">{p.name}</h1>
            <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-ink">
              {p.mpn && (
                <span>
                  Part no. <span className="font-medium text-ink tabular-nums">{p.mpn}</span>
                </span>
              )}
              {p.specGroups.length > 0 && (
                <a href="#specs" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-950">
                  Full specifications <ArrowDown className="size-3.5" />
                </a>
              )}
            </div>
            {p.keySpecs.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {p.keySpecs.map((s) => (
                  <li key={s} className="rounded-full bg-surface px-3 py-1.5 text-sm text-brand-900">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {p.highlights.length > 0 && (
              <ul className="grid gap-2.5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-cta text-brand-950">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
            {sold && p.price ? (
              <BuyBox item={{ slug: p.slug, name: p.name, href: `/products/${p.categorySlug}/${p.slug}`, image: p.images[0]?.src ?? null, price: p.price }} quoteHref={quote} stock={p.availability} />
            ) : (
            <div className="rounded-card bg-brand-900 p-6 text-white">
              <p className="text-sm text-white/60">Price</p>
              <p className="mt-1 font-heading text-2xl font-medium">B2B price on request</p>
              <p className="mt-1 text-sm text-white/60">Volume pricing for your quantity, with a VAT invoice.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Action href={quote}>Get B2B price</Action>
                <AddToQuote slug={p.slug} name={p.name} label className="border-white/20 text-white hover:border-cta" />
                {p.related[0] && (
                  <Action href={`/compare/${p.slug}-vs-${p.related[0].slug}`} variant="onDark" arrow={false}>
                    Compare
                  </Action>
                )}
              </div>
              <ChatNowButton message={`Hi, I'm looking for B2B pricing on the ${p.name}.`} context={{ product: p.slug, category: p.categorySlug, cta: "Product page" }} className="mt-3 bg-white/10 hover:bg-white/15" />
            </div>
            )}
            {sold && p.related[0] && (
              <Link href={`/compare/${p.slug}-vs-${p.related[0].slug}`} className="group flex items-center gap-3 rounded-card border border-line/70 bg-white px-4 py-3 text-sm transition-colors hover:border-brand-700/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-brand-800">
                  <ArrowLeftRight className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">Compare side by side</span>
                  <span className="block truncate text-xs text-muted-ink">with {p.related[0].name}</span>
                </span>
              </Link>
            )}
            {facts.length > 0 && (
              <dl className="grid gap-3 sm:grid-cols-3">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-card border border-line/70 bg-white p-4">
                    <f.icon className="size-5 text-brand-700" strokeWidth={1.75} />
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
        <section className="container-site pb-10 sm:pb-12">
          <h2 className="text-xl font-semibold">Best for</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.bestFor.map((b) => (
              <Link key={`${b.industrySlug}${b.role}`} href={`/industries/${b.industrySlug}`} className="group flex items-center justify-between gap-4 rounded-card bg-white p-5 transition-shadow hover:shadow-lift">
                <span className="grid">
                  {b.label && <span className="text-xs font-semibold tracking-[0.12em] text-brand-700 uppercase">{b.label}</span>}
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
        <section className="bg-surface-soft py-8 sm:py-10">
          <div className="container-site grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            {p.summaryHtml ? <div className="prose prose-lg max-w-none prose-headings:font-heading prose-headings:font-medium prose-a:text-brand-700" dangerouslySetInnerHTML={{ __html: p.summaryHtml }} /> : <div />}
            <div className="grid content-start gap-4">
              {p.pros.length > 0 && (
                <div className="rounded-card bg-white p-6">
                  <h2 className="font-semibold">Why we like it</h2>
                  <ul className="mt-4 grid gap-2.5">
                    {p.pros.map((x) => (
                      <li key={x} className="flex gap-3 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand-700" /> {x}
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

      {about.length > 0 && (
        <section className="bg-surface-soft py-8 sm:py-10">
          <div className="container-site">
            <h2 className="text-h2">About the {shortName(p)}</h2>
            <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
              {about.map((b) => (
                <div key={b.heading}>
                  <h3 className="font-semibold text-ink">{b.heading}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted-ink">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <nav aria-label="Related pages" className="container-site flex flex-wrap items-center gap-2 pt-8 text-sm">
          <span className="mr-1 font-semibold text-ink">{p.guides?.length ? "Read before buying:" : "See also:"}</span>
          {p.guides?.map((g) => (
            <Link key={g.path} href={g.path} className="rounded-full border border-line bg-white px-3.5 py-1.5 hover:border-brand-700/40">
              {g.title}
            </Link>
          ))}
          <Link href={`/products/${p.categorySlug}`} className="rounded-full border border-line bg-white px-3.5 py-1.5 hover:border-brand-700/40">
            All {p.category.toLowerCase()}
          </Link>
          {p.brandSlug && (
            <Link href={`/brands/${p.brandSlug}`} className="rounded-full border border-line bg-white px-3.5 py-1.5 hover:border-brand-700/40">
              {p.brand} in the UAE
            </Link>
          )}
        </nav>

      <section id="specs" className="container-site scroll-mt-32 py-8 sm:py-10">
        <SectionHeading tag="Specifications" title="Full specifications" />
        <div className="mt-5">
          <SpecTable groups={p.specGroups} />
        </div>
        {p.sourceUrl && (
          <p className="mt-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-ink">
            Specifications from the
            <a href={p.sourceUrl} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
              brand&apos;s page <ExternalLink className="size-3.5" />
            </a>
            {p.specsCheckedAt && <>, checked {new Date(p.specsCheckedAt).toLocaleDateString("en-AE", { month: "long", year: "numeric" })}</>}. Configurations can change; we confirm them on your quote.
          </p>
        )}
      </section>

      <Faq items={faq} title={`${shortName(p)}: questions we get asked`} />

      {p.related.length > 0 && (
        <section className="container-site pb-12 sm:pb-14">
          <SectionHeading tag="Related" title={`More ${p.category.toLowerCase()}`} />
          <div className="mt-5">
            <ProductGrid products={p.related} />
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {p.related.slice(0, 3).map((r) => (
              <Link key={r.slug} href={`/compare/${p.slug}-vs-${r.slug}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm hover:border-brand-700/40">
                <ArrowLeftRight className="size-3.5 shrink-0 text-brand-700" />
                <span className="truncate">Compare with {r.name}</span>
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
          description: p.highlights.join(". ") || about[0]?.text || undefined,
          additionalProperty: p.specGroups.flatMap((g) => g.rows.map((r) => ({ "@type": "PropertyValue", name: r.label, value: r.value }))),
          // a price only when the product shows one; "price on request" products carry no offer rather than a made-up one
          offers:
            p.priceMode === "public" && Number(p.price) > 0
              ? {
                  "@type": "Offer",
                  url,
                  price: Number(p.price).toFixed(2),
                  priceCurrency: p.currency || "AED",
                  availability: STOCK_SCHEMA[p.availability] ?? STOCK_SCHEMA.in_stock,
                  itemCondition: "https://schema.org/NewCondition",
                  priceSpecification: { "@type": "UnitPriceSpecification", price: Number(p.price).toFixed(2), priceCurrency: p.currency || "AED", valueAddedTaxIncluded: true },
                  eligibleRegion: { "@type": "Country", name: "AE" },
                  seller: { "@id": `${SITE_URL}/#organization` },
                  // from Website › Settings › Store; nothing is published that the store settings do not state
                  shippingDetails: store
                    ? {
                        "@type": "OfferShippingDetails",
                        shippingDestination: { "@type": "DefinedRegion", addressCountry: "AE" },
                        shippingRate: { "@type": "MonetaryAmount", value: (store.freeAbove > 0 && Number(p.price) >= store.freeAbove ? 0 : store.deliveryFee).toFixed(2), currency: p.currency || "AED" },
                      }
                    : undefined,
                  hasMerchantReturnPolicy:
                    store && store.returnDays > 0
                      ? {
                          "@type": "MerchantReturnPolicy",
                          applicableCountry: "AE",
                          returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                          merchantReturnDays: store.returnDays,
                          returnMethod: "https://schema.org/ReturnByMail",
                        }
                      : undefined,
                }
              : undefined,
        }}
      />
    </>
  );
}
