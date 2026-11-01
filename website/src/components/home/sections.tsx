import Link from "next/link";
import { Action, ArrowCircle, SectionHeading, Tag } from "@/components/brand/action";
import { AccentCard, DarkCard, FeatureCard, PhotoCard, Stat } from "@/components/brand/cards";
import { Photo } from "@/components/brand/photo";
import type { SiteBrand, SiteHome, SiteIndustryCard, SiteNavLink } from "@/lib/contract";
import { imageFor } from "@/lib/images";

/** Home page sections in the brand (BRAND.md): every section uses the brand components, nothing one-off. */

/** Finovate's row under the hero: white feature, lime highlight, sage feature. */
export function Features({ features }: { features: SiteHome["features"] }) {
  if (!features.length) return null;
  return (
    <section className="container-site pt-6 pb-24 sm:pt-8">
      <div className="grid gap-4 md:grid-cols-3">
        {features.map((f, i) =>
          i === 1 ? (
            <AccentCard key={f.title} href={f.href || "/"} tag={f.tag} title={f.title} photo={imageFor(f.image)} subject={f.title} className="reveal" />
          ) : (
            <FeatureCard key={f.title} href={f.href || "/"} tag={f.tag} title={f.title} text={f.text} photo={imageFor(f.image)} subject={f.title} tone={i === 2 ? "sage" : "white"} className="reveal" />
          ),
        )}
      </div>
    </section>
  );
}

export function Industries({ industries }: { industries: SiteIndustryCard[] }) {
  if (!industries.length) return null;
  return (
    <section id="industries" className="scroll-mt-24 bg-sage-50 py-24">
      <div className="container-site">
        <SectionHeading center tag="Solutions by industry" title="Built around the way your industry works" lead="Pick your industry to see the setups, the UAE models and the specs that fit what your people actually do every day." />
        <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {industries.map((x) => (
            <PhotoCard key={x.slug} href={`/industries/${x.slug}`} title={x.name} icon={x.icon} ratio="4:3" photo={x.image?.src ?? imageFor(`industry-${x.slug}`)} subject={`${x.name}: ${x.summary}`} className="reveal" />
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4 text-center">
          <p className="text-muted-ink">Don&apos;t see your industry? We match the machines to the work.</p>
          <Action href="/quote" variant="dark">
            Get matched
          </Action>
        </div>
      </div>
    </section>
  );
}

/** Forest band: reasons as dark cards, the key numbers underneath. */
export function WhyUs({ brand, home }: { brand: SiteBrand; home: SiteHome }) {
  if (!home.reasons.length && !home.stats.length) return null;
  return (
    <section className="frame bg-forest-900 py-20 sm:py-24">
      <div className="container-site">
        <SectionHeading onDark rule tag={`Why ${brand.name}`} title="A partner for business IT, not a shopping cart" lead="Business series only, UAE part numbers and warranty, and advice before you buy." />
        {home.reasons.length > 0 && (
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {home.reasons.map((r) => (
              <DarkCard key={r.title} icon={r.icon} title={r.title} text={r.text} className="reveal" />
            ))}
          </div>
        )}
        {home.stats.length > 0 && (
          <dl className="mt-14 grid grid-cols-2 gap-8 border-t border-white/10 pt-10 lg:grid-cols-4">
            {home.stats.map((s) => (
              <Stat key={s.label} onDark value={s.value} label={s.label} />
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

export function Categories({ categories }: { categories: SiteNavLink[] }) {
  if (!categories.length) return null;
  return (
    <section className="container-site py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading tag="Products" title="Business-grade hardware, in stock in the UAE" />
        <Action href="/products" variant="outline" arrow={false} className="reveal">
          All products
        </Action>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {categories.map((c) => (
          <Link key={c.slug} href={`/products/${c.slug}`} className="group reveal flex h-full flex-col rounded-card bg-white p-2 transition-shadow duration-200 hover:shadow-lift">
            <Photo src={imageFor(`category-${c.slug}`)} subject={`${c.name}: product shot on sage`} ratio="1:1" />
            <div className="flex items-start justify-between gap-3 px-3 pt-4 pb-3">
              <div>
                <h3 className="text-base font-semibold sm:text-lg">{c.name}</h3>
                <p className="mt-1 hidden text-sm text-muted-ink sm:block">{c.summary}</p>
              </div>
              <ArrowCircle />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Photo on one side, the numbered steps on the other. */
export function Steps({ steps }: { steps: SiteHome["steps"] }) {
  if (!steps.length) return null;
  return (
    <section className="container-site pb-24">
      <div className="grid items-center gap-10 rounded-frame bg-white p-3 lg:grid-cols-2 lg:gap-16">
        <Photo src={imageFor("delivery")} subject="Technician unpacking and setting up new business laptops for a team" ratio="4:3" className="rounded-card" />
        <div className="p-5 lg:p-8">
          <SectionHeading tag="How it works" title="From your industry to a quote" />
          <ol className="mt-10 grid gap-7">
            {steps.map((s, i) => (
              <li key={s.title} className="reveal flex gap-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime-400 font-heading text-lg font-semibold text-forest-950">{i + 1}</span>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-muted-ink">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Brand names as type (no trademark artwork). */
export function Brands({ brands }: { brands: SiteNavLink[] }) {
  if (!brands.length) return null;
  return (
    <section className="container-site pb-24">
      <div className="flex flex-col items-center gap-8 border-y border-line py-12 lg:flex-row lg:justify-between">
        <Tag>Business series from</Tag>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {brands.map((b) => (
            <li key={b.slug}>
              <Link href={`/brands/${b.slug}`} className="font-heading text-2xl font-semibold tracking-tight text-forest-900/40 transition-colors hover:text-forest-900">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Closing lime band: the one big call to action. */
export function CtaBand({ cta, brand }: { cta: SiteHome["ctaBand"]; brand: SiteBrand }) {
  return (
    <section className="frame mb-4 bg-lime-400 text-forest-950">
      <div className="container-site grid items-center gap-10 py-16 lg:grid-cols-[1.4fr_1fr] lg:py-20">
        <div className="reveal">
          <Tag className="border-forest-950/20 bg-transparent text-forest-950/70">B2B pricing</Tag>
          <h2 className="mt-5 max-w-2xl text-h2">{cta.title}</h2>
          {cta.text && <p className="mt-5 max-w-xl text-lead text-forest-950/75">{cta.text}</p>}
        </div>
        <div className="reveal flex flex-wrap gap-3 lg:justify-end">
          <Action href="/quote" variant="dark" size="lg">
            {brand.ctaLabel}
          </Action>
          <Action href="/contact" variant="outline" size="lg" arrow={false} className="border-forest-950/20 bg-transparent hover:bg-white/40">
            Talk to sales
          </Action>
        </div>
      </div>
    </section>
  );
}
