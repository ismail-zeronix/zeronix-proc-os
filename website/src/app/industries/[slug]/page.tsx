import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Action, SectionHeading } from "@/components/brand/action";
import { DarkCard } from "@/components/brand/cards";
import { CtaStrip, Faq, JsonLd, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { getIndustry, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { imageFor } from "@/lib/images";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/industries/[slug]">): Promise<Metadata> {
  const x = await getIndustry((await params).slug);
  if (!x) return {};
  return {
    title: x.seo.title || `${x.heroTitle || `IT for ${x.name}`} in the UAE`,
    description: x.seo.description || x.summary,
    alternates: { canonical: `/industries/${x.slug}` },
    openGraph: { images: x.image ? [x.image.src] : undefined },
  };
}

/** Industry hub: what the industry struggles with, setups per role, recommended models, FAQ, B2B action. */
export default async function IndustryPage({ params }: PageProps<"/industries/[slug]">) {
  const [x, { brand }] = await Promise.all([getIndustry((await params).slug), getSettings()]);
  if (!x) notFound();
  const quote = quoteLink({ industry: x.slug });
  const labels = Object.fromEntries(x.products.filter((p) => p.label).map((p) => [p.slug, p.label]));

  return (
    <>
      <PageHero
        crumbs={[
          { href: "/industries", label: "Industries" },
          { href: `/industries/${x.slug}`, label: x.name },
        ]}
        tag="Industry"
        title={x.heroTitle || `IT for ${x.name.toLowerCase()} teams in the UAE`}
        lead={x.summary}
        photo={x.image?.src ?? imageFor(`industry-${x.slug}`)}
        photoSubject={`${x.name}: people at work with their machines`}
        actions={
          <>
            <Action href={quote} size="lg">
              {brand.ctaLabel}
            </Action>
            {x.products.length > 0 && (
              <Action href="#models" size="lg" variant="outline" arrow={false}>
                See the models
              </Action>
            )}
          </>
        }
      />

      {(x.introHtml || x.painPoints.length > 0) && (
        <section className="container-site grid gap-6 py-8 sm:py-10 lg:grid-cols-[1.2fr_1fr]">
          {x.introHtml && <div className="prose prose-lg max-w-none prose-headings:font-heading prose-headings:font-medium prose-a:text-forest-700" dangerouslySetInnerHTML={{ __html: x.introHtml }} />}
          {x.painPoints.length > 0 && (
            <div className="reveal rounded-card bg-white p-6">
              <h2 className="text-xl font-semibold">What slows {x.name.toLowerCase()} teams down</h2>
              <ul className="mt-5 grid gap-3">
                {x.painPoints.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-lime-400" />
                    <span className="text-muted-ink">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {x.roles.length > 0 && (
        <section className="frame bg-forest-900 py-8 sm:py-10">
          <div className="container-site">
            <SectionHeading onDark rule tag="Setups by role" title={`What each role in ${x.name.toLowerCase()} needs`} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {x.roles.map((r) => (
                <div key={r.role} className="reveal">
                  <DarkCard icon={x.icon || "briefcase"} title={r.role} text={r.needs} />
                  {r.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 px-1">
                      {r.categories.map((c) => (
                        <Link key={c.slug} href={`/products/${c.slug}`} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:border-lime-400 hover:text-lime-400">
                          {c.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {x.products.length > 0 && (
        <section id="models" className="container-site scroll-mt-24 py-8 sm:py-10">
          <SectionHeading tag="Recommended models" title={`Our picks for ${x.name.toLowerCase()}`} lead="UAE part numbers with local warranty. Prices on request for your quantity." />
          <div className="mt-5">
            <ProductGrid products={x.products} labels={labels} />
          </div>
        </section>
      )}

      <Faq items={x.faq} />

      <CtaStrip title={`Equipping a ${x.name.toLowerCase()} team?`} text="Tell us how many people and which roles. We reply with a shortlist and B2B pricing, usually within a working day." quoteHref={quote} label={brand.ctaLabel} />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: x.heroTitle || x.name,
          description: x.summary,
          url: `${SITE_URL}/industries/${x.slug}`,
          ...(x.products.length
            ? { mainEntity: { "@type": "ItemList", itemListElement: x.products.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/products/${p.categorySlug}/${p.slug}`, name: p.name })) } }
            : {}),
        }}
      />
    </>
  );
}
