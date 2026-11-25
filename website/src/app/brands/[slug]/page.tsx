import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { BuyingLead, ChipLinks } from "@/components/catalog/seo-blocks";
import { getBrand, getSettings } from "@/lib/api";
import { BRAND_SEO } from "@/lib/seo-brands";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const b = await getBrand((await params).slug);
  if (!b) return {};
  return {
    title: `${b.name} business IT in Dubai, UAE`,
    description: `${b.name} business laptops, desktops and more in Dubai with Middle East part numbers, local warranty, VAT invoice and B2B pricing.`.slice(0, 155),
    alternates: { canonical: `/brands/${b.slug}` },
  };
}

/** A brand: a short intro, its business ranges by category (each with its own page), its products, a quote. */
export default async function BrandPage({ params }: PageProps<"/brands/[slug]">) {
  const [b, { brand }] = await Promise.all([getBrand((await params).slug), getSettings()]);
  if (!b) notFound();
  const seo = BRAND_SEO[b.slug];
  const ranges = Object.entries(seo?.categories ?? {}).map(([cat, x]) => ({ href: `/brands/${b.slug}/${cat}`, label: x.heading }));
  return (
    <>
      <PageHero
        crumbs={[{ href: `/brands/${b.slug}`, label: b.name }]}
        tag="Brand"
        title={`${b.name} for business`}
        lead={b.uaeWarrantyNote || `${b.name} business series with Middle East part numbers and local warranty.`}
        actions={
          <Action href={quoteLink({})} size="lg">
            {brand.ctaLabel}
          </Action>
        }
      />
      {seo && <BuyingLead paragraphs={[seo.intro]} title={`${b.name} in the UAE`} />}
      {ranges.length > 0 && (
        <nav aria-label={`${b.name} ranges`} className="container-site pt-3 sm:pt-5">
          <ChipLinks label={`${b.name} by category:`} items={ranges} />
        </nav>
      )}
      <section className="container-site py-6 sm:py-8">
        {b.products.length ? <ProductGrid products={b.products} /> : <p className="text-muted-ink">{b.name} models are being added. Ask us for any model in the {b.name} business range.</p>}
      </section>
      <CtaStrip title={`Buying ${b.name} for your team?`} text="Any model from the business range, with B2B pricing and UAE warranty." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
