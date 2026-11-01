import { Hero } from "@/components/home/hero";
import { Brands, Categories, CtaBand, Features, Industries, Steps, WhyUs } from "@/components/home/sections";
import { getIndustries, getNav, getSettings } from "@/lib/api";

// rebuilt at most every 10 minutes, or at once when the portal publishes a change
export const revalidate = 600;

export default async function HomePage() {
  const [{ brand, home }, nav, { industries }] = await Promise.all([getSettings(), getNav(), getIndustries()]);

  return (
    <>
      <Hero brand={brand} home={home} />
      <Features features={home.features} />
      <Industries industries={industries} />
      <Categories categories={nav.categories} />
      <Steps steps={home.steps} />
      <WhyUs brand={brand} home={home} />
      <div className="h-24" />
      <Brands brands={nav.brands} />
      <CtaBand cta={home.ctaBand} brand={brand} />
    </>
  );
}
