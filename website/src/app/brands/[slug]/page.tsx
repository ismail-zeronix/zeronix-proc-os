import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { getBrand, getSettings } from "@/lib/api";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const b = await getBrand((await params).slug);
  if (!b) return {};
  return { title: `${b.name} business laptops and PCs in the UAE`, description: `${b.name} business series with UAE part numbers, local warranty and B2B pricing.`, alternates: { canonical: `/brands/${b.slug}` } };
}

export default async function BrandPage({ params }: PageProps<"/brands/[slug]">) {
  const [b, { brand }] = await Promise.all([getBrand((await params).slug), getSettings()]);
  if (!b) notFound();
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
      <section className="container-site py-16">
        {b.products.length ? <ProductGrid products={b.products} /> : <p className="text-muted-ink">{b.name} models are being added. Ask us for any model in the {b.name} business range.</p>}
      </section>
      <CtaStrip title={`Buying ${b.name} for your team?`} text="Any model from the business range, with B2B pricing and UAE warranty." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
