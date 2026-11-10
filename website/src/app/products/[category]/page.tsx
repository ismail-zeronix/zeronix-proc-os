import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, Faq, JsonLd, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { X } from "lucide-react";
import { GRID_COLS, GRID_COLS_FILTERED } from "@/components/brand/skeleton";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import { MoreProducts } from "@/components/catalog/more-products";
import { Pagination } from "@/components/catalog/pagination";
import { getCategory, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { listProducts, sortOf, SORTS, type SortId } from "@/lib/catalog-list";
import { imageFor } from "@/lib/images";
import { categoryTitle } from "@/lib/product-copy";
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
  const filtered = Boolean(one(sp.brand) || one(sp.industry) || one(sp.sort));
  const title = c.seo.title || categoryTitle(c.name, c.brands.slice(0, 3).map((b) => b.name));
  return {
    title: page > 1 ? `${title} · Page ${page}` : title,
    description: c.seo.description || c.summary,
    // each numbered page is its own canonical; filtered views point at the plain category and stay out of the index
    alternates: { canonical: filtered ? base : listHref(base, { page }) },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

/** One filter group (Brand, Industry) as plain links (?brand=hp&industry=legal), so filtered lists work without JavaScript. */
function FilterGroup({ title, name, items, active, base, other }: { title: string; name: string; items: { slug: string; name: string; count: number }[]; active?: string; base: string; other: Record<string, string | undefined> }) {
  if (items.length < 2) return null;
  const href = (v?: string) => listHref(base, { ...other, [name]: v });
  const row = "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors";
  const dot = (on: boolean) => <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-brand-900 bg-brand-900" : "border-line bg-white")}>{on && <span className="size-1.5 rounded-full bg-white" />}</span>;
  return (
    <section className="grid gap-1">
      <h2 className="px-2 text-xs font-semibold tracking-[0.12em] text-muted-ink uppercase">{title}</h2>
      <ul className="grid">
        <li>
          <Link href={href()} aria-current={!active ? "true" : undefined} className={cn(row, !active ? "font-semibold text-ink" : "text-ink/80 hover:bg-surface-soft")}>
            {dot(!active)} All
          </Link>
        </li>
        {items.map((x) => (
          <li key={x.slug}>
            <Link href={href(x.slug)} aria-current={active === x.slug ? "true" : undefined} className={cn(row, active === x.slug ? "font-semibold text-ink" : "text-ink/80 hover:bg-surface-soft")}>
              {dot(active === x.slug)}
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="text-xs text-muted-ink tabular-nums">{x.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sort as plain links too (?sort=price-asc), a compact segmented control next to the count. */
function SortLinks({ active, base, other }: { active: SortId; base: string; other: Record<string, string | undefined> }) {
  const short: Record<SortId, string> = { "": "Recommended", "price-asc": "Price ↑", "price-desc": "Price ↓" };
  return (
    <nav aria-label="Sort" className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-ink sm:inline">Sort</span>
      <div className="inline-flex rounded-full border border-line bg-white p-0.5">
        {SORTS.map((s) => (
          <Link
            key={s.id || "recommended"}
            href={listHref(base, { ...other, sort: s.id || undefined })}
            aria-label={s.label}
            aria-current={active === s.id ? "true" : undefined}
            rel="nofollow"
            className={cn("rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm", active === s.id ? "bg-brand-900 text-white" : "text-ink hover:bg-surface")}
          >
            {short[s.id]}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/products/[category]">) {
  const [c, { brand }] = await Promise.all([getCategory((await params).category), getSettings()]);
  if (!c) notFound();
  const sp = await searchParams;
  const brandFilter = one(sp.brand);
  const industryFilter = one(sp.industry);
  const sort = sortOf(one(sp.sort));
  const matching = listProducts(c.products, { brand: brandFilter, industry: industryFilter, sort });
  const pages = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const page = pageOf(sp);
  if (page > pages) notFound();
  const shown = matching.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const base = `/products/${c.slug}`;
  const filters = { brand: brandFilter, industry: industryFilter, sort: sort || undefined };
  // buying advice and questions belong to the category itself: page 1, no filters
  const landing = page === 1 && !brandFilter && !industryFilter && !sort;
  // no category picture yet: show four of its real product pictures rather than an empty photo slot
  const photo = c.image?.src ?? imageFor(`category-${c.slug}`);
  const mosaic = photo ? undefined : c.products.flatMap((p) => (p.image ? [p.image.src] : [])).slice(0, 4);
  const hasFilters = c.brands.length > 1 || c.industries.length > 1;
  const cols = hasFilters ? GRID_COLS_FILTERED : GRID_COLS;
  const activeBrand = c.brands.find((b) => b.slug === brandFilter)?.name;
  const activeIndustry = c.industries.find((x) => x.slug === industryFilter)?.name;
  const activeCount = (activeBrand ? 1 : 0) + (activeIndustry ? 1 : 0);
  const filterPanel = (
    <div className="grid gap-4">
      <FilterGroup title="Brand" name="brand" items={c.brands} active={brandFilter} base={base} other={{ industry: industryFilter, sort: filters.sort }} />
      <FilterGroup title="Industry" name="industry" items={c.industries} active={industryFilter} base={base} other={{ brand: brandFilter, sort: filters.sort }} />
    </div>
  );

  return (
    <>
      <PageHero
        crumbs={[
          { href: "/products", label: "Products" },
          { href: base, label: c.name },
        ]}
        tag="Products"
        title={/business/i.test(c.name) ? `${c.name} in the UAE` : `${c.name} for business`}
        lead={c.summary}
        photo={photo}
        mosaic={mosaic}
        photoSubject={mosaic?.length === 4 ? undefined : `${c.name}: product shot on a light background`}
        actions={
          <Action href={quoteLink({ category: c.slug })} size="lg">
            {brand.ctaLabel}
          </Action>
        }
      />
      <section className={cn("container-site grid items-start gap-4 py-5 sm:py-6", hasFilters && "lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-6")}>
        {hasFilters && (
          <aside aria-label="Filters" className="sticky top-32 hidden max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-card border border-line/70 bg-white p-3 lg:block">
            {filterPanel}
          </aside>
        )}
        <div className="grid min-w-0 gap-4">
          {matching.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-3">
              <div className="flex items-center gap-3">
                {hasFilters && <FilterSheet active={activeCount}>{filterPanel}</FilterSheet>}
                <p className="text-sm text-muted-ink">
                  {pages > 1 ? `${(page - 1) * PER_PAGE + 1}–${(page - 1) * PER_PAGE + shown.length} of ${matching.length}` : `${matching.length}`} {matching.length === 1 ? "model" : "models"}
                </p>
              </div>
              {matching.length > 1 && <SortLinks active={sort} base={base} other={{ brand: brandFilter, industry: industryFilter }} />}
            </div>
          )}
          {activeCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {activeBrand && (
                <Link href={listHref(base, { industry: industryFilter, sort: filters.sort })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-900 pr-2.5 pl-3.5 text-white hover:bg-brand-800" aria-label={`Remove filter ${activeBrand}`}>
                  {activeBrand} <X className="size-3.5" />
                </Link>
              )}
              {activeIndustry && (
                <Link href={listHref(base, { brand: brandFilter, sort: filters.sort })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-900 pr-2.5 pl-3.5 text-white hover:bg-brand-800" aria-label={`Remove filter ${activeIndustry}`}>
                  {activeIndustry} <X className="size-3.5" />
                </Link>
              )}
              <Link href={listHref(base, { sort: filters.sort })} className="font-semibold text-brand-700 hover:text-brand-950">
                Clear all
              </Link>
            </div>
          )}
          {shown.length ? (
            <ProductGrid products={shown} cols={cols} />
          ) : (
            <div className="rounded-card bg-white p-10 text-center">
              <h2 className="text-xl font-semibold">{c.products.length ? "Nothing matches these filters" : "Models are being added"}</h2>
              <p className="mx-auto mt-2 max-w-md text-muted-ink">Tell us what you need and we will send options with B2B pricing.</p>
              <div className="mt-6 flex justify-center">
                <Action href={quoteLink({ category: c.slug })}>{brand.ctaLabel}</Action>
              </div>
            </div>
          )}
          <MoreProducts category={c.slug} brand={brandFilter} industry={industryFilter} sort={sort || undefined} page={page} pages={pages} per={PER_PAGE} cols={cols}>
            <Pagination page={page} pages={pages} href={(n) => listHref(base, { ...filters, page: n })} label={`${c.name} pages`} />
          </MoreProducts>
        </div>
      </section>

      {landing && c.introHtml && (
        <section className="container-site py-6 sm:py-8">
          <div className="rounded-frame border border-line/70 bg-white p-5 sm:p-8">
            <div
              className="prose max-w-3xl prose-headings:font-heading prose-headings:font-medium prose-h2:text-h2 prose-h3:text-lg prose-a:text-brand-700 prose-li:my-0.5"
              dangerouslySetInnerHTML={{ __html: c.introHtml }}
            />
          </div>
        </section>
      )}
      {landing && ((c.guides?.length ?? 0) > 0 || c.industries.length > 0) && (
        <nav aria-label="Guides and industries" className="container-site grid gap-3 py-6 text-sm sm:py-8">
          {(c.guides?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-semibold text-ink">Buying guides:</span>
              {c.guides!.map((g) => (
                <Link key={g.path} href={g.path} className="rounded-full border border-line bg-white px-3.5 py-1.5 hover:border-brand-700/40">
                  {g.title}
                </Link>
              ))}
            </div>
          )}
          {c.industries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-semibold text-ink">{c.name} by industry:</span>
              {c.industries.map((x) => (
                <Link key={x.slug} href={`/industries/${x.slug}`} className="rounded-full border border-line bg-white px-3.5 py-1.5 hover:border-brand-700/40">
                  {x.name}
                </Link>
              ))}
            </div>
          )}
        </nav>
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
