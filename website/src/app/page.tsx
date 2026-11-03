import { Hero } from "@/components/home/hero";
import { KeywordHub, type EmirateKeywords } from "@/components/home/keyword-hub";
import { Faq } from "@/components/catalog/page-parts";
import { Brands, BundlesBand, CategoryShelf, CategoryTiles, CtaBand, Featured, HowItWorks, Industries, LatestGuides, ServicesBento, WhyUs } from "@/components/home/sections";
import { getIndustries, getNav, getPosts, getProducts, getSettings } from "@/lib/api";

// rebuilt at most every 10 minutes, or at once when the portal publishes a change
export const revalidate = 600;

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

export default async function HomePage() {
  const [{ brand, home }, nav, { industries }, newest, servicePosts, guides] = await Promise.all([
    getSettings(),
    getNav(),
    getIndustries(),
    getProducts({ limit: 12 }),
    getPosts({ kind: "services" }),
    getPosts({ kind: "guides" }),
  ]);
  // every category gets its own rail; empty ones are left out
  const byCategory = await Promise.all(nav.categories.map((c) => getProducts({ category: c.slug, limit: 12 })));
  const shelves = nav.categories.map((c, i) => ({ category: c, products: byCategory[i].products })).filter((s) => s.products.length);
  const shelf = (from: number, to?: number) => shelves.slice(from, to).map((s) => <CategoryShelf key={s.category.slug} category={s.category} products={s.products} />);

  const excerpts = Object.fromEntries(servicePosts.posts.map((p) => [p.path, p.excerpt]));
  const keywords: EmirateKeywords[] = EMIRATES.map((e) => ({
    emirate: e,
    products: [
      ...nav.categories.map((c) => ({ href: `/products/${c.slug}`, label: `${c.name} in ${e}` })),
      { href: "/products", label: `IT hardware supplier in ${e}` },
      { href: "/quote", label: `Bulk IT orders in ${e}` },
    ],
    services: [...home.services.map((s) => ({ href: s.href, label: `${s.label} in ${e}` })), { href: "/services", label: `IT company in ${e}` }],
  }));

  return (
    <>
      <Hero brand={brand} home={home} />
      <CategoryTiles categories={nav.categories} />
      <Featured featured={home.featured} products={newest.products} />
      {shelf(0, 1)}
      <ServicesBento services={home.services} excerpts={excerpts} ctaLabel={brand.ctaLabel} />
      {shelf(1, 3)}
      <HowItWorks ctaLabel={brand.ctaLabel} />
      {shelf(3, 5)}
      <Industries industries={industries} />
      <BundlesBand bundles={home.bundles} />
      {shelf(5)}
      <WhyUs brand={brand} home={home} />
      <LatestGuides posts={guides.posts} />
      <Brands brands={nav.brands} />
      <Faq items={homeFaq(brand.name)} />
      <CtaBand cta={home.ctaBand} brand={brand} />
      <KeywordHub groups={keywords} />
    </>
  );
}
