import { Hero } from "@/components/home/hero";
import type { Shelf } from "@/components/home/featured";
import { Brands, BundlesBand, CategoryTiles, CtaBand, Featured, Industries, Promos, Services, WhyUs } from "@/components/home/sections";
import { getIndustries, getNav, getProducts, getSettings } from "@/lib/api";

// rebuilt at most every 10 minutes, or at once when the portal publishes a change
export const revalidate = 600;

/** Up to three categories get their own tab on the product shelf, after "New arrivals". */
const SHELF_CATEGORIES = 3;

export default async function HomePage() {
  const [{ brand, home }, nav, { industries }, newest] = await Promise.all([getSettings(), getNav(), getIndustries(), getProducts({ limit: 12 })]);
  const cats = nav.categories.slice(0, SHELF_CATEGORIES);
  const byCategory = await Promise.all(cats.map((c) => getProducts({ category: c.slug, limit: 12 })));
  const shelves: Shelf[] = [
    { key: "new", label: "New arrivals", products: newest.products },
    ...cats.map((c, i) => ({ key: c.slug, label: c.name, products: byCategory[i].products })),
  ];

  return (
    <>
      <Hero brand={brand} home={home} />
      <Industries industries={industries} />
      <Promos business={home.business} office={home.office} />
      <CategoryTiles categories={nav.categories} />
      <BundlesBand bundles={home.bundles} />
      <Featured featured={home.featured} shelves={shelves} />
      <Services services={home.services} />
      <WhyUs brand={brand} home={home} />
      <div className="h-24" />
      <Brands brands={nav.brands} />
      <CtaBand cta={home.ctaBand} brand={brand} />
    </>
  );
}
