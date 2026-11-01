import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareTable } from "@/components/catalog/compare-table";
import { Breadcrumbs, CtaStrip, quoteLink } from "@/components/catalog/page-parts";
import { getCompare, getSettings } from "@/lib/api";

export const revalidate = 600;

/** "/compare/hp-elitebook-840-vs-dell-latitude-7450" → the two slugs (up to four). */
const slugsOf = (pair: string) => decodeURIComponent(pair).split("-vs-").filter(Boolean).slice(0, 4);

export async function generateMetadata({ params }: PageProps<"/compare/[pair]">): Promise<Metadata> {
  const c = await getCompare(slugsOf((await params).pair));
  if (!c) return {};
  const names = c.products.map((p) => p.name).join(" vs ");
  return { title: `${names}: specs compared`, description: `${names} side by side: processor, memory, display, weight and warranty, with UAE B2B pricing.`, alternates: { canonical: `/compare/${c.products.map((p) => p.slug).join("-vs-")}` } };
}

export default async function ComparePage({ params }: PageProps<"/compare/[pair]">) {
  const [c, { brand }] = await Promise.all([getCompare(slugsOf((await params).pair)), getSettings()]);
  if (!c) notFound();
  const names = c.products.map((p) => p.name).join(" vs ");

  return (
    <>
      <section className="container-site pt-8 pb-12">
        <Breadcrumbs items={[{ href: `/compare/${c.products.map((p) => p.slug).join("-vs-")}`, label: "Compare" }]} />
        <h1 className="mt-6 max-w-4xl text-h2">{names}</h1>
        <p className="mt-4 max-w-2xl text-lead text-muted-ink">Side by side, spec by spec. Every model has a UAE part number and local warranty.</p>
      </section>
      <section className="container-site pb-20">
        <CompareTable products={c.products} groups={c.groups} />
      </section>
      <CtaStrip title="Still deciding?" text="Tell us who will use them and for what. We'll recommend one and send B2B pricing." quoteHref={quoteLink({ product: c.products[0].slug })} label={brand.ctaLabel} />
    </>
  );
}
