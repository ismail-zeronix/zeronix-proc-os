import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryGlyph } from "@/components/home/category-icons";
import { CtaStrip, PageHero, quoteLink } from "@/components/catalog/page-parts";
import { getCategories, getSettings } from "@/lib/api";

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
      {/* categories as icon rows (no photos): a list on phones, a grid from sm */}
      <section className="container-site py-5 sm:py-8">
        <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/products/${c.slug}`} className="group flex h-full items-center gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-brand-900 sm:gap-4 sm:p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-brand-900 transition-colors group-hover:bg-brand-900 group-hover:text-on-brand sm:size-14">
                  <CategoryGlyph icon={c.icon} className="size-6 sm:size-7" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <h2 className="text-[0.9375rem] leading-tight font-semibold text-ink sm:text-base">{c.name}</h2>
                  <span className="text-xs text-muted-ink">{c.count ? `${c.count} model${c.count === 1 ? "" : "s"}` : "Models on request"}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-ink transition-transform group-hover:translate-x-0.5 group-hover:text-brand-900" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CtaStrip title="Need something not listed?" text="We source the full business range of every major brand. Tell us the model or the job it has to do." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
