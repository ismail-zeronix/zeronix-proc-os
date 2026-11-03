import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, Faq, JsonLd, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { MoreProducts } from "@/components/catalog/more-products";
import { Pagination } from "@/components/catalog/pagination";
import { getCategory, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { imageFor } from "@/lib/images";
import { cn } from "@/lib/utils";

/** Products per page: four rows of the desktop grid. */
const PER_PAGE = 24;

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const pageOf = (sp: Query) => Math.max(1, Math.floor(Number(one(sp.page))) || 1);

/** The address of a list view: filters first, then ?page (left out on page 1). */
function listHref(base: string, q: Record<string, string | number | undefined>) {
  const params = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v && !(k === "page" && v === 1) ? [[k, String(v)]] : [])));
  return params.size ? `${base}?${params}` : base;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/products/[category]">): Promise<Metadata> {
  const [c, sp] = await Promise.all([getCategory((await params).category), searchParams]);
  if (!c) return {};
  const page = pageOf(sp);
  const base = `/products/${c.slug}`;
  const filtered = Boolean(one(sp.brand) || one(sp.industry));
  const title = c.seo.title || `${c.name} for business in the UAE`;
  return {
    title: page > 1 ? `${title} · Page ${page}` : title,
    description: c.seo.description || c.summary,
    // each numbered page is its own canonical; filtered views point at the plain category
    alternates: { canonical: filtered ? base : listHref(base, { page }) },
  };
}

/** Filter chips are plain links (?brand=hp&industry=legal), so filtered lists work without JavaScript. */
function Chips({ name, items, active, base, other }: { name: string; items: { slug: string; name: string; count: number }[]; active?: string; base: string; other: Record<string, string | undefined> }) {
  if (items.length < 2) return null;
  const href = (v?: string) => listHref(base, { ...other, [name]: v });
  const chip = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors";
  return (
    <div className="scroll-row items-center sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
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
  const brandFilter = one(sp.brand);
  const industryFilter = one(sp.industry);
  const matching = c.products.filter((p) => (!brandFilter || p.brandSlug === brandFilter) && (!industryFilter || p.industries.includes(industryFilter)));
  const pages = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const page = pageOf(sp);
  if (page > pages) notFound();
  const shown = matching.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const base = `/products/${c.slug}`;
  const filters = { brand: brandFilter, industry: industryFilter };
  // buying advice and questions belong to the category itself: page 1, no filters
  const landing = page === 1 && !brandFilter && !industryFilter;

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
      <section className="container-site grid gap-4 py-5 sm:py-6">
        <div className="grid gap-3">
          <Chips name="brand" items={c.brands} active={brandFilter} base={base} other={{ industry: industryFilter }} />
          <Chips name="industry" items={c.industries} active={industryFilter} base={base} other={{ brand: brandFilter }} />
        </div>
        {matching.length > 0 && (
          <p className="text-sm text-muted-ink">
            {pages > 1 ? `${(page - 1) * PER_PAGE + 1}–${(page - 1) * PER_PAGE + shown.length} of ${matching.length}` : `${matching.length}`} {matching.length === 1 ? "model" : "models"}
          </p>
        )}
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
        <MoreProducts category={c.slug} brand={brandFilter} industry={industryFilter} page={page} pages={pages} per={PER_PAGE}>
          <Pagination page={page} pages={pages} href={(n) => listHref(base, { ...filters, page: n })} label={`${c.name} pages`} />
        </MoreProducts>
      </section>

      {landing && c.introHtml && (
        <section className="container-site py-6 sm:py-8">
          <div className="rounded-frame border border-line/70 bg-white p-5 sm:p-8">
            <div
              className="prose max-w-3xl prose-headings:font-heading prose-headings:font-medium prose-h2:text-h2 prose-h3:text-lg prose-a:text-forest-700 prose-li:my-0.5"
              dangerouslySetInnerHTML={{ __html: c.introHtml }}
            />
          </div>
        </section>
      )}
      {landing && <Faq items={c.faq} title={`${c.name}: questions we get asked`} />}

      <CtaStrip title={`Buying ${c.name.toLowerCase()} in volume?`} text="Corporate pricing, VAT invoices and delivery across the Emirates." quoteHref={quoteLink({ category: c.slug })} label={brand.ctaLabel} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: page > 1 ? `${c.name} · Page ${page}` : c.name,
          url: `${SITE_URL}${listHref(base, { page })}`,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: matching.length,
            itemListElement: shown.map((p, i) => ({ "@type": "ListItem", position: (page - 1) * PER_PAGE + i + 1, url: `${SITE_URL}${base}/${p.slug}`, name: p.name })),
          },
        }}
      />
    </>
  );
}
