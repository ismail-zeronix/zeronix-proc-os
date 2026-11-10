import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/page-parts";
import { QuoteForm } from "@/components/quote/quote-form";
import { Tag } from "@/components/brand/action";
import { getIndustry, getNav, getProduct, getSettings } from "@/lib/api";

export const metadata: Metadata = {
  title: "Get B2B pricing",
  description: "Tell us your industry, the models you like and how many you need. We reply with corporate pricing, usually within a working day.",
  alternates: { canonical: "/quote" },
};

/**
 * The B2B pricing form (WEBSITE-PLAN.md section 7), filled in from the link that opened it:
 * /quote?industry=real-estate&product=hp-elitebook-840-g11&category=laptops
 */
export default async function QuotePage({ searchParams }: PageProps<"/quote">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 120) : "");
  const [nav, { brand }, product, industry] = await Promise.all([getNav(), getSettings(), one(sp.product) ? getProduct(one(sp.product)).catch(() => null) : null, one(sp.industry) ? getIndustry(one(sp.industry)).catch(() => null) : null]);
  const category = nav.categories.find((c) => c.slug === one(sp.category));

  return (
    <section className="container-site grid gap-6 py-10 lg:grid-cols-[1fr_22rem] lg:py-8">
      <div className="grid content-start gap-6">
        <Breadcrumbs items={[{ href: "/quote", label: brand.ctaLabel }]} />
        <Tag>B2B pricing</Tag>
        <h1 className="text-h2">{industry ? `B2B pricing for your ${industry.name.toLowerCase()} team` : product ? `B2B pricing for the ${product.name}` : "Get B2B pricing"}</h1>
        <p className="max-w-2xl text-lead text-muted-ink">Tell us what you need and how many. We reply with corporate pricing, availability and delivery time, usually within a working day.</p>
        <QuoteForm
          brand={brand}
          industries={nav.industries.map((i) => ({ slug: i.slug, name: i.name }))}
          prefill={{ industry: industry?.slug ?? "", product: product ? { slug: product.slug, name: product.name } : null, category: category?.name ?? "" }}
        />
      </div>
      <aside className="grid content-start gap-4">
        <div className="rounded-card bg-brand-900 p-6 text-white">
          <h2 className="font-heading text-xl font-medium">What happens next</h2>
          <ol className="mt-5 grid gap-4 text-sm text-white/75">
            {["We check UAE stock and the right part numbers for your team.", "You get a quote with volume pricing and a VAT invoice.", "We deliver and can set the machines up across the Emirates."].map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cta font-semibold text-brand-950">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-card bg-white p-6 text-sm text-muted-ink">
          <p className="font-semibold text-ink">Your details stay with us</p>
          <p className="mt-1">We use them only to answer this request. No newsletter unless you ask for one.</p>
        </div>
      </aside>
    </section>
  );
}
