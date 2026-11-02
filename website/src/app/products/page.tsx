import type { Metadata } from "next";
import Link from "next/link";
import { ArrowCircle } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import { CtaStrip, PageHero, quoteLink } from "@/components/catalog/page-parts";
import { getCategories, getSettings } from "@/lib/api";
import { imageFor } from "@/lib/images";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Business laptops, desktops, workstations and servers",
  description: "Business-grade IT in stock in the UAE: business laptops, desktops, certified workstations and servers with local warranty and B2B pricing.",
  alternates: { canonical: "/products" },
};

export default async function ProductsPage() {
  const [{ categories }, { brand }] = await Promise.all([getCategories(), getSettings()]);
  return (
    <>
      <PageHero crumbs={[{ href: "/products", label: "Products" }]} tag="Products" title="Business-grade hardware, in stock in the UAE" lead="Business series from the major brands, with Middle East part numbers, local warranty and corporate pricing." />
      <section className="container-site py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.slug} href={`/products/${c.slug}`} className="group reveal flex h-full flex-col rounded-card bg-white p-2 transition-shadow duration-200 hover:shadow-lift">
              <Photo src={c.image?.src ?? imageFor(`category-${c.slug}`)} subject={`${c.name}: product shot on sage`} ratio="1:1" />
              <div className="flex items-start justify-between gap-3 px-3 pt-4 pb-3">
                <div>
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <p className="mt-1 text-sm text-muted-ink">{c.count ? `${c.count} model${c.count === 1 ? "" : "s"}` : "Models on request"}</p>
                </div>
                <ArrowCircle />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <CtaStrip title="Need something not listed?" text="We source the full business range of every major brand. Tell us the model or the job it has to do." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
