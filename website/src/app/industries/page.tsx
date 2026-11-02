import type { Metadata } from "next";
import { PhotoCard } from "@/components/brand/cards";
import { CtaStrip, PageHero, quoteLink } from "@/components/catalog/page-parts";
import { getIndustries, getSettings } from "@/lib/api";
import { imageFor } from "@/lib/images";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "IT by industry",
  description: "Business laptops, desktops, workstations and servers matched to how each UAE industry works: real estate, design, healthcare, finance and more.",
  alternates: { canonical: "/industries" },
};

export default async function IndustriesPage() {
  const [{ industries }, { brand }] = await Promise.all([getIndustries(), getSettings()]);
  return (
    <>
      <PageHero crumbs={[{ href: "/industries", label: "Industries" }]} tag="Solutions by industry" title="IT matched to the way your industry works" lead="Every team uses its machines differently. Pick your industry to see the setups, the UAE models and the specs that fit." />
      <section className="container-site py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {industries.map((x) => (
            <PhotoCard key={x.slug} href={`/industries/${x.slug}`} title={x.name} icon={x.icon} ratio="4:3" photo={x.image?.src ?? imageFor(`industry-${x.slug}`)} subject={`${x.name}: ${x.summary}`} className="reveal" />
          ))}
        </div>
      </section>
      <CtaStrip title="Don't see your industry?" text="Tell us what your team does and we'll match the machines to the work, with B2B pricing." quoteHref={quoteLink({})} label={brand.ctaLabel} />
    </>
  );
}
