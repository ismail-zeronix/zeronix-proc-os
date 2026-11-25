import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, JsonLd, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { BuyingLead, ChipLinks, CompareTable } from "@/components/catalog/seo-blocks";
import { getBrand, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { BRAND_SEO } from "@/lib/seo-brands";
import { CATEGORY_SEO } from "@/lib/seo-categories";

export const revalidate = 600;

/** Only pairings with their own text (lib/seo-brands.ts) are pages; anything else is "not found". */
async function load(slug: string, category: string) {
  const pair = BRAND_SEO[slug]?.categories[category];
  if (!pair) return null;
  const b = await getBrand(slug);
  if (!b) return null;
  return { b, pair, products: b.products.filter((p) => p.categorySlug === category) };
}

export async function generateMetadata({ params }: PageProps<"/brands/[slug]/[category]">): Promise<Metadata> {
  const { slug, category } = await params;
  const x = await load(slug, category);
  if (!x) return {};
  return {
    // 45 characters at most (the layout adds " · Zeronix Tech")
    title: [`${x.pair.heading} in Dubai, UAE`, `${x.pair.heading} in the UAE`, x.pair.heading].find((t) => t.length <= 45) ?? x.pair.heading,
    description: `${x.pair.heading}: ${x.pair.series.slice(0, 3).join(", ")}. Middle East models, local warranty, VAT invoice and B2B pricing in the UAE.`.slice(0, 155),
    alternates: { canonical: `/brands/${slug}/${category}` },
    // a pairing with no products yet is thin: reachable, but kept out of the index until models are added
    ...(x.products.length ? {} : { robots: { index: false, follow: true } }),
  };
}

/** "HP business laptops", "Dell workstations", "Lenovo servers": the brand's range in one category, with its own text. */
export default async function BrandCategoryPage({ params }: PageProps<"/brands/[slug]/[category]">) {
  const { slug, category } = await params;
  const [x, { brand }] = await Promise.all([load(slug, category), getSettings()]);
  if (!x) notFound();
  const { b, pair, products } = x;
  const others = Object.entries(BRAND_SEO[slug].categories)
    .filter(([c]) => c !== category)
    .map(([c, p]) => ({ href: `/brands/${slug}/${c}`, label: p.heading }));
  const table = CATEGORY_SEO[category]?.table;
  return (
    <>
      <PageHero
        crumbs={[
          { href: `/brands/${slug}`, label: b.name },
          { href: `/brands/${slug}/${category}`, label: pair.heading },
        ]}
        tag={b.name}
        title={`${pair.heading} in the UAE`}
        lead={`${pair.series.join(", ")}. Middle East models with local warranty and B2B pricing.`}
        actions={
          <Action href={quoteLink({ category })} size="lg">
            {brand.ctaLabel}
          </Action>
        }
      />
      <BuyingLead paragraphs={[pair.text]} />
      <section className="container-site py-4 sm:py-6">
        {products.length ? (
          <ProductGrid products={products} />
        ) : (
          <p className="rounded-card bg-panel p-6 text-muted-ink">
            {pair.heading} are being added to the site. We supply the full range: ask us for any model and we send B2B pricing.
          </p>
        )}
      </section>
      {table && <CompareTable title={`Compare ${pair.heading}`} products={products} labels={table} />}
      <nav aria-label="More" className="container-site grid gap-2.5 py-3 sm:py-5">
        <ChipLinks label={`More from ${b.name}:`} items={others} />
        <ChipLinks label="All brands in this category:" items={[{ href: `/products/${category}`, label: `All ${category.replace(/-/g, " ")}` }]} />
      </nav>
      <CtaStrip title={`Buying ${pair.heading} for your team?`} text="Any model in the range, with B2B pricing, VAT invoice and delivery across the Emirates." quoteHref={quoteLink({ category })} label={brand.ctaLabel} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: pair.heading,
          url: `${SITE_URL}/brands/${slug}/${category}`,
          mainEntity: { "@type": "ItemList", numberOfItems: products.length, itemListElement: products.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/products/${p.categorySlug}/${p.slug}`, name: p.name })) },
        }}
      />
    </>
  );
}
