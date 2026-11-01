import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, JsonLd, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { getCategory, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { imageFor } from "@/lib/images";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/products/[category]">): Promise<Metadata> {
  const c = await getCategory((await params).category);
  if (!c) return {};
  return { title: c.seo.title || `${c.name} for business in the UAE`, description: c.seo.description || c.summary, alternates: { canonical: `/products/${c.slug}` } };
}

/** Filter chips are plain links (?brand=hp&industry=legal), so filtered lists work without JavaScript. */
function Chips({ name, items, active, base, other }: { name: string; items: { slug: string; name: string; count: number }[]; active?: string; base: string; other: Record<string, string | undefined> }) {
  if (items.length < 2) return null;
  const href = (v?: string) => {
    const q = new URLSearchParams(Object.entries({ ...other, [name]: v }).filter((e): e is [string, string] => Boolean(e[1])));
    return q.size ? `${base}?${q}` : base;
  };
  const chip = "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href()} className={cn(chip, !active ? "border-forest-900 bg-forest-900 text-white" : "border-line bg-white hover:border-forest-700/40")}>
        All
      </Link>
      {items.map((x) => (
        <Link key={x.slug} href={href(x.slug)} className={cn(chip, active === x.slug ? "border-forest-900 bg-forest-900 text-white" : "border-line bg-white hover:border-forest-700/40")}>
          {x.name} <span className="text-xs opacity-60">{x.count}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/products/[category]">) {
  const [c, { brand }] = await Promise.all([getCategory((await params).category), getSettings()]);
  if (!c) notFound();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const brandFilter = one(sp.brand);
  const industryFilter = one(sp.industry);
  const shown = c.products.filter((p) => (!brandFilter || p.brandSlug === brandFilter) && (!industryFilter || p.industries.includes(industryFilter)));
  const base = `/products/${c.slug}`;

  return (
    <>
      <PageHero
        crumbs={[
          { href: "/products", label: "Products" },
          { href: base, label: c.name },
        ]}
        tag="Products"
        title={`${c.name} for business`}
        lead={c.summary}
        photo={c.image?.src ?? imageFor(`category-${c.slug}`)}
        photoSubject={`${c.name}: product shot on sage`}
        actions={
          <Action href={quoteLink({ category: c.slug })} size="lg">
            {brand.ctaLabel}
          </Action>
        }
      />
      <section className="container-site grid gap-8 py-16">
        <div className="grid gap-3">
          <Chips name="brand" items={c.brands} active={brandFilter} base={base} other={{ industry: industryFilter }} />
          <Chips name="industry" items={c.industries} active={industryFilter} base={base} other={{ brand: brandFilter }} />
        </div>
        {shown.length ? (
          <ProductGrid products={shown} />
        ) : (
          <div className="rounded-card bg-white p-10 text-center">
            <h2 className="text-xl font-semibold">{c.products.length ? "Nothing matches these filters" : "Models are being added"}</h2>
            <p className="mx-auto mt-2 max-w-md text-muted-ink">Tell us what you need and we will send options with B2B pricing.</p>
            <div className="mt-6 flex justify-center">
              <Action href={quoteLink({ category: c.slug })}>{brand.ctaLabel}</Action>
            </div>
          </div>
        )}
      </section>
      <CtaStrip title={`Buying ${c.name.toLowerCase()} in volume?`} text="Corporate pricing, VAT invoices and delivery across the Emirates." quoteHref={quoteLink({ category: c.slug })} label={brand.ctaLabel} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: c.name,
          url: `${SITE_URL}${base}`,
          mainEntity: { "@type": "ItemList", itemListElement: c.products.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${base}/${p.slug}`, name: p.name })) },
        }}
      />
    </>
  );
}
