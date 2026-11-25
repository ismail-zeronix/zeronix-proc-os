import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Action } from "@/components/brand/action";
import { CtaStrip, Faq, JsonLd, PageHero, ProductGrid, quoteLink } from "@/components/catalog/page-parts";
import { BuyingLead, ChipLinks } from "@/components/catalog/seo-blocks";
import { ShortQuote } from "@/components/quote/short-quote";
import { getCategory, getSettings } from "@/lib/api";
import type { SiteProductSummary } from "@/lib/contract";
import { SITE_URL } from "@/lib/defaults";
import { formatPrice } from "@/lib/price";
import { VC_NAMES, VC_PARENT, VC_SUBS } from "@/lib/seo-categories";
import { EMIRATE_PAGES, emiratePage } from "@/lib/seo-emirates";

export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams() {
  return EMIRATE_PAGES.map((e) => ({ place: e.slug }));
}

export async function generateMetadata({ params }: PageProps<"/video-conferencing/[place]">): Promise<Metadata> {
  const e = emiratePage((await params).place);
  if (!e) return {};
  return { title: e.title, description: e.description, alternates: { canonical: `/video-conferencing/${e.slug}` } };
}

/**
 * Video conferencing per emirate ("video conferencing systems Dubai"): its own headline, intro and questions
 * (lib/seo-emirates.ts), the meeting-room product categories, a few products from them, and the short quote form.
 */
export default async function EmirateVcPage({ params }: PageProps<"/video-conferencing/[place]">) {
  const e = emiratePage((await params).place);
  if (!e) notFound();
  const [{ brand }, ...pages] = await Promise.all([getSettings(), ...[VC_PARENT, ...VC_SUBS].map((s) => getCategory(s).catch(() => null))]);
  // a few products from the meeting-room categories: pictured and priced first, one kind at a time
  const queues = pages.map((p) => [...(p?.products ?? [])].sort((a, b) => Number(Boolean(b.image)) * 2 + Number(Boolean(formatPrice(b.price))) - (Number(Boolean(a.image)) * 2 + Number(Boolean(formatPrice(a.price))))));
  const picks: SiteProductSummary[] = [];
  for (let i = 0; picks.length < 8 && queues.some((q) => i < q.length); i++) for (const q of queues) if (q[i] && picks.length < 8 && !picks.some((x) => x.slug === q[i].slug)) picks.push(q[i]);
  const others = EMIRATE_PAGES.filter((x) => x.slug !== e.slug);
  // only categories that exist (an admin creates them with the meeting-room starter in Website › Categories)
  const live = [VC_PARENT, ...VC_SUBS].filter((_, i) => pages[i]);

  return (
    <>
      <PageHero
        crumbs={[
          { href: `/products/${VC_PARENT}`, label: "Video conferencing" },
          { href: `/video-conferencing/${e.slug}`, label: e.place === "the UAE" ? "UAE" : e.place },
        ]}
        tag="Video conferencing"
        title={e.h1}
        lead={e.intro[0]}
        actions={
          <Action href={quoteLink({ category: VC_PARENT })} size="lg">
            Get product pricing
          </Action>
        }
      />
      <BuyingLead paragraphs={e.intro.slice(1)} />
      <section className="container-site grid gap-4 py-4 sm:py-6 lg:grid-cols-2">
        <div className="rounded-card border border-line/70 bg-panel p-4 sm:p-6">
          <h2 className="text-h2">Meeting rooms we equip in {e.place}</h2>
          <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-muted-ink">
            {e.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <nav aria-label="Meeting room hardware" className="grid content-start gap-3 rounded-card border border-line/70 bg-panel p-4 sm:p-6">
          <h2 className="text-h2">Meeting room hardware</h2>
          {live.length ? (
            <ChipLinks label="" items={live.map((x) => ({ href: `/products/${x}`, label: VC_NAMES[x] }))} />
          ) : (
            <p className="text-sm text-muted-ink">Cameras, speakerphones, room kits, wireless presentation, displays and control panels. Ask us for the full range and pricing.</p>
          )}
        </nav>
      </section>
      {picks.length > 0 && (
        <section className="container-site py-4 sm:py-6">
          <h2 className="text-h2">Meeting room products</h2>
          <div className="mt-3">
            <ProductGrid products={picks} />
          </div>
        </section>
      )}
      <Faq items={e.faq} title={`Video conferencing in ${e.place}: questions`} />
      <ShortQuote
        title={`Get product pricing for ${e.place === "the UAE" ? "your" : e.place} meeting rooms`}
        text="Tell us how many rooms, their size and your platform (Teams, Zoom or BYOD). We reply with options and B2B pricing, usually within a working day."
        cta="Get product pricing"
        topic={`Video conferencing, ${e.place}`}
        placeholder="e.g. 3 small rooms and a boardroom for 14 people, Microsoft Teams"
      />
      <nav aria-label="Other emirates" className="container-site py-2 sm:py-4">
        <ChipLinks label="Also in:" items={others.map((x) => ({ href: `/video-conferencing/${x.slug}`, label: x.place === "the UAE" ? "All UAE" : x.place }))} />
      </nav>
      <CtaStrip title="Equipping several meeting rooms?" text="One quote and one VAT invoice for every room, with installation by our AV team." quoteHref={quoteLink({ category: VC_PARENT })} label={brand.ctaLabel} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          name: e.h1,
          serviceType: "Video conferencing systems supply and installation",
          areaServed: e.place === "the UAE" ? { "@type": "Country", name: "United Arab Emirates" } : { "@type": "City", name: e.place },
          provider: { "@type": "Organization", name: brand.name, url: SITE_URL },
          url: `${SITE_URL}/video-conferencing/${e.slug}`,
        }}
      />
    </>
  );
}
