import { CtaStrip, Faq, quoteLink } from "@/components/catalog/page-parts";
import { Hero, heroPicks } from "@/components/home/hero";
import { LazyShelf } from "@/components/home/lazy-shelf";
import { Brands, BundlesBand, CategoryShelf, CategoryTiles, Featured, HowItWorks, Industries, LatestGuides, ServicesBento, WhyUs } from "@/components/home/sections";
import type { CategoryCardData } from "@/components/home/category-rail";
import { getCategories, getCategory, getIndustries, getNav, getPosts, getProducts, getSettings } from "@/lib/api";
import type { SiteCategoriesResponse, SiteCategoryPage, SiteProductSummary } from "@/lib/contract";
import { formatPrice } from "@/lib/price";
import { MIN_SHELF } from "@/lib/shelf";

// rebuilt at most every 10 minutes, or at once when the portal publishes a change
export const revalidate = 600;

// the home page's one address (?utm_... and other query strings point back here)
export const metadata = { alternates: { canonical: "/" } };

const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

/** Home page questions (also FAQPage data for search). Only promises the site already makes elsewhere. */
const homeFaq = (name: string) => [
  {
    q: `Does ${name} give corporate or bulk pricing?`,
    a: "Yes. Add products to your quote list, send part numbers or just tell us the team size, and we reply with B2B pricing and a VAT invoice.",
  },
  { q: "Do you deliver outside Dubai?", a: `Yes. We deliver across all seven emirates: ${EMIRATES.join(", ")}.` },
  { q: "Are the products UAE stock with local warranty?", a: "We supply Middle East part numbers with the manufacturer's local warranty, and can add extended or on-site cover for most business models." },
  { q: "Can you install and support what you supply?", a: "Yes. Our IT services cover networking and Wi-Fi, cybersecurity, CCTV, access control, meeting rooms and annual maintenance (AMC), so one team sets up and looks after your office IT." },
  { q: "Can I order online or do I need a quote?", a: "Both. Products with a price can go straight into the cart; for larger orders, or models shown as price on request, ask for a quote and we send B2B pricing." },
];

/** Most brand cards ("Dell desktops") after the category cards. */
const MAX_BRAND_CARDS = 10;

/**
 * The "Shop by category" cards: every category (stocked ones first) with its live count and a real product picture from
 * it, then the biggest brand-within-category lists, which link to the category page already filtered by brand.
 */
function categoryCards(categories: SiteCategoriesResponse["categories"], pageOf: Map<string, SiteCategoryPage | null>): CategoryCardData[] {
  const stocked = categories.filter((c) => c.count > 0);

  const cats: CategoryCardData[] = [...stocked, ...categories.filter((c) => !c.count)].map((c) => ({
    href: `/products/${c.slug}`,
    title: c.name,
    count: c.count,
    image: c.image?.src ?? pageOf.get(c.slug)?.products.find((p) => p.image)?.image?.src,
    icon: c.icon,
    kind: "category",
  }));

  const brands: CategoryCardData[] = stocked
    .flatMap((c) => {
      const page = pageOf.get(c.slug);
      // a category with one brand would only repeat its own card
      if (!page || page.brands.length < 2) return [];
      return page.brands
        .filter((b) => b.count >= 2)
        .map((b) => ({
          href: `/products/${c.slug}?brand=${encodeURIComponent(b.slug)}`,
          title: `${b.name} ${c.name.toLowerCase()}`,
          count: b.count,
          image: page.products.find((p) => p.brandSlug === b.slug && p.image)?.image?.src,
          icon: c.icon,
          kind: "brand" as const,
        }));
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_BRAND_CARDS);

  return [...cats, ...brands];
}

/**
 * "Featured products": a mix across categories (one from each in turn), pictured and priced ones first, leaving out what
 * the hero already shows. Plain "newest" would repeat whichever category was imported last, and so the shelf below it.
 */
function featuredMix(pages: (SiteCategoryPage | null)[], skip: SiteProductSummary[], max = 12): SiteProductSummary[] {
  const taken = new Set(skip.map((p) => p.slug));
  const score = (p: SiteProductSummary) => Number(Boolean(p.image)) * 2 + Number(Boolean(formatPrice(p.price)));
  const queues = pages.flatMap((pg) => (pg ? [pg.products.filter((p) => !taken.has(p.slug)).sort((a, b) => score(b) - score(a))] : []));
  const out: SiteProductSummary[] = [];
  for (let i = 0; out.length < max && queues.some((q) => i < q.length); i++) for (const q of queues) if (q[i] && out.length < max) out.push(q[i]);
  // pictured cards lead; the mix order is kept within each group (sort is stable)
  return out.sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)));
}

export default async function HomePage() {
  const [{ brand, home }, nav, { industries }, newest, guides, { categories }] = await Promise.all([
    getSettings(),
    getNav(),
    getIndustries(),
    getProducts({ limit: 12 }),
    getPosts({ kind: "guides" }),
    getCategories(),
  ]);
  // Every category with at least MIN_SHELF products gets its own rail (the live counts say which, so a short one never
  // flashes skeletons and then vanishes). The first is in the page HTML; the rest load as the visitor scrolls to them
  // (LazyShelf, skeleton cards meanwhile), so the first screen does not wait on every category.
  const countOf = new Map(categories.map((c) => [c.slug, c.count]));
  const [first, ...later] = nav.categories.filter((c) => (countOf.get(c.slug) ?? 0) >= MIN_SHELF);
  const stocked = categories.filter((c) => c.count > 0);
  const [firstShelf, pages] = await Promise.all([
    first ? getProducts({ category: first.slug, limit: 12 }).then((x) => x.products) : [],
    Promise.all(stocked.map((c) => getCategory(c.slug).catch(() => null))),
  ]);
  const cards = categoryCards(categories, new Map(stocked.map((c, i) => [c.slug, pages[i]])));
  const shelf = (from: number, to?: number) => later.slice(from, to).map((c) => <LazyShelf key={c.slug} category={c} />);

  // the hero shows three products; the featured rail mixes categories and leaves those three out
  const picks = heroPicks(newest.products);
  const featured = featuredMix(pages, picks);

  return (
    <>
      <Hero brand={brand} home={home} picks={picks} />
      <CategoryTiles cards={cards} />
      <Featured featured={home.featured} products={featured.length >= 4 ? featured : newest.products} />
      {first && <CategoryShelf category={first} products={firstShelf} />}
      <ServicesBento services={home.services} />
      {shelf(0, 2)}
      <HowItWorks ctaLabel={brand.ctaLabel} />
      {shelf(2, 4)}
      <Industries industries={industries} />
      <BundlesBand bundles={home.bundles} />
      {shelf(4)}
      <LatestGuides posts={guides.posts} />
      <WhyUs brand={brand} home={home} />
      <Brands brands={nav.brands} />
      <Faq items={homeFaq(brand.name)} />
      <CtaStrip title={home.ctaBand.title} text={home.ctaBand.text} quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
