import type { Metadata } from "next";
import { Action, ArrowCircle, SectionHeading, Tag } from "@/components/brand/action";
import { AccentCard, DarkCard, FeatureCard, IconBadge, PhotoCard, ProductCard, Stat, UiChip } from "@/components/brand/cards";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Photo } from "@/components/brand/photo";

/** The brand system, live (BRAND.md). Not linked and not indexed: a reference for whoever builds the next page. */
export const metadata: Metadata = { title: "Brand system", robots: { index: false, follow: false }, alternates: { canonical: "/brand" } };

const COLOURS = [
  { name: "cta", hex: "#0f9d58", use: "Header bar, large green fills", cls: "bg-cta text-on-brand" },
  { name: "brand-900", hex: "#0a8443", use: "Buttons, links, active states", cls: "bg-brand-900 text-on-brand" },
  { name: "brand-800", hex: "#087236", use: "Hover on green", cls: "bg-brand-800 text-on-brand" },
  { name: "brand-700", hex: "#0b8f47", use: "Icons and accents", cls: "bg-brand-700 text-white" },
  { name: "brand-950", hex: "#05532a", use: "Deep green text on tints", cls: "bg-brand-950 text-white" },
  { name: "highlight", hex: "#d6f5e3", use: "Mint: badges, text on green", cls: "bg-highlight text-brand-950" },
  { name: "surface", hex: "#e8f5ee", use: "Icon circles, soft cards", cls: "bg-surface text-brand-950" },
  { name: "surface-soft", hex: "#f5f6f8", use: "Grey wells and steps", cls: "bg-surface-soft text-ink" },
  { name: "page", hex: "#f2f3f5", use: "Home page background", cls: "bg-page text-ink border border-line" },
  { name: "canvas", hex: "#ffffff", use: "Panels and pages", cls: "bg-canvas text-ink border border-line" },
  { name: "ink", hex: "#1d2330", use: "Body text, slate banner", cls: "bg-ink text-white" },
  { name: "muted", hex: "#666e7a", use: "Secondary text", cls: "bg-muted-ink text-white" },
  { name: "line", hex: "#e5e7eb", use: "Borders, dividers", cls: "bg-line text-ink" },
];

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="container-site border-t border-line py-6 sm:py-8">
      <p className="text-sm font-semibold text-brand-700">{n}</p>
      <h2 className="mt-1 text-3xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function BrandPage() {
  return (
    <>
      {/* hero sample */}
      <section className="frame relative mt-3 bg-band text-white">
        <div className="relative grid min-h-[34rem] lg:grid-cols-2">
          <div className="relative z-10 flex flex-col justify-center gap-7 p-8 sm:p-12 lg:p-16">
            <Tag onDark>Corporate IT for UAE businesses</Tag>
            <h1 className="max-w-xl text-display text-white">
              Business IT, matched to <span className="text-highlight">your industry.</span>
            </h1>
            <p className="max-w-md text-lead text-white/70">Laptops, desktops, workstations and servers for the way your team works. UAE stock, local warranty, corporate pricing.</p>
            <div className="flex flex-wrap gap-3">
              <Action href="/quote" size="lg" variant="light">
                Get B2B pricing
              </Action>
              <Action href="/#industries" size="lg" variant="onDark" arrow={false}>
                Explore by industry
              </Action>
            </div>
          </div>
          <div className="relative min-h-80 p-3 lg:p-4">
            <Photo subject="UAE office team around a table with business laptops, warm natural light" fill tone="dark" className="rounded-[1.5rem]" />
            <UiChip icon="package-check" label="In stock" value="UAE warehouse" className="absolute top-10 left-8" />
            <UiChip icon="shield-check" label="Warranty" value="3 years, Middle East" className="absolute right-8 bottom-10" />
          </div>
        </div>
      </section>

      <div className="container-site py-6 sm:py-8">
        <Tag>Brand system</Tag>
        <h1 className="mt-5 max-w-3xl text-h1">The rules every page of zeronixtech.com follows.</h1>
        <p className="mt-4 max-w-2xl text-lead text-muted-ink">Written in website/BRAND.md. A bright green store in the noon.com style: green header, grey home page with white panels, slate text, rectangular buttons, icon categories. No lime, no dark-green bands, no gradients.</p>
      </div>

      <Block n="01" title="Logo">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid h-40 place-items-center rounded-card bg-panel">
            <Logo />
          </div>
          <div className="grid h-40 place-items-center rounded-card bg-cta">
            <Logo onDark />
          </div>
          <div className="grid h-40 place-items-center gap-2 rounded-card bg-surface">
            <LogoMark className="size-16" />
          </div>
        </div>
      </Block>

      <Block n="02" title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLOURS.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-card bg-panel">
              <div className={`h-24 ${c.cls} flex items-end p-3 text-xs font-semibold`}>{c.hex}</div>
              <div className="p-3">
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-muted-ink">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-ink">About 70% white and grey, 20% green, 10% mint and slate. Green text only in the darker brand-900 shade; white text on green fills. No lime, purple, glows or gradients.</p>
      </Block>

      <Block n="03" title="Typography">
        <div className="grid gap-8 rounded-card bg-panel p-8">
          <div>
            <p className="text-xs text-muted-ink">Display · Manrope 500</p>
            <p className="font-heading text-display font-semibold">Business IT, matched to your industry.</p>
          </div>
          <div>
            <p className="text-xs text-muted-ink">H2 · Manrope 500</p>
            <p className="font-heading text-h2 font-semibold">Every team works differently.</p>
          </div>
          <div>
            <p className="text-xs text-muted-ink">H3 · Manrope 600</p>
            <p className="font-heading text-xl font-semibold">Best laptops for real estate agents</p>
          </div>
          <div className="grid gap-2">
            <p className="text-xs text-muted-ink">Lead and body · Figtree 400</p>
            <p className="max-w-2xl text-lead text-muted-ink">Tell us what your team does. We shortlist the right business laptops, desktops, workstations and servers.</p>
            <p className="max-w-2xl">Middle East part numbers with Arabic/English keyboards, three-year local warranty and VAT invoices for every order.</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Tag>Tag · Figtree 600</Tag>
            <dl>
              <Stat value="24h" label="Numbers · Manrope 500" />
            </dl>
          </div>
        </div>
      </Block>

      <Block n="04" title="Buttons, tags, icons">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-panel p-8">
            <Action href="/quote">Get B2B pricing</Action>
            <Action href="/guides" variant="dark">
              Read the guide
            </Action>
            <Action href="/products" variant="outline" arrow={false}>
              All products
            </Action>
            <span className="group">
              <ArrowCircle />
            </span>
            <Tag>Who we are</Tag>
            <IconBadge name="laptop" />
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-band p-8">
            <Action href="/quote" variant="light">Get B2B pricing</Action>
            <Action href="/products" variant="onDark" arrow={false}>
              All products
            </Action>
            <span className="group">
              <ArrowCircle onDark />
            </span>
            <Tag onDark>Industry</Tag>
            <IconBadge name="server" onDark />
          </div>
        </div>
      </Block>

      <Block n="05" title="Cards: feature row (from the Finovate reference)">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard href="/about" tag="Who we are" title="The UAE partner for business IT, matched to the work" subject="Our team with a client, office setting" />
          <AccentCard href="/industries/real-estate" tag="Industry" title="Best laptops for real estate agents in the UAE" subject="Agent showing a property on a light laptop" />
          <FeatureCard href="/guides" tag="Guide" title="Workstations for architects: what really matters" tone="surface" subject="Architect at a dual-monitor workstation" />
        </div>
      </Block>

      <Block n="06" title="Cards: photo cards (industries, guides)">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <PhotoCard href="/industries/real-estate" title="Real estate" icon="building" subject="Agent with client, laptop open" />
          <PhotoCard href="/industries/architecture-design" title="Architecture & design" icon="pen-tool" subject="Architect at workstation" />
          <PhotoCard href="/industries/healthcare" title="Healthcare & clinics" icon="stethoscope" subject="Clinic reception desk PC" />
          <PhotoCard href="/industries/finance-accounting" title="Finance & accounting" icon="landmark" subject="Analyst with two monitors" />
        </div>
      </Block>

      <section className="frame bg-band py-8 sm:py-10">
        <div className="container-site">
          <SectionHeading onDark rule tag="Dark band" title="Strategic setups that fit how your teams work" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DarkCard icon="badge-check" title="Business-grade only" text="Business series from the major brands, never consumer models." />
            <DarkCard icon="shield-check" title="UAE warranty" text="Middle East part numbers, Arabic/English keyboards, local service." />
            <DarkCard icon="receipt" title="Corporate pricing" text="Volume pricing, VAT invoices and credit terms." />
            <DarkCard icon="headset" title="Advice first" text="We match machines to roles before you buy." />
          </div>
          <dl className="mt-14 grid grid-cols-2 gap-8 border-t border-white/10 pt-10 lg:grid-cols-4">
            <Stat onDark value="24h" label="Quote turnaround" />
            <Stat onDark value="3yr" label="Local warranty options" />
            <Stat onDark value="12+" label="Industries served" />
            <Stat onDark value="100%" label="Business series" />
          </dl>
        </div>
      </section>

      <Block n="07" title="Product cards (now and in the shop)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProductCard href="/products/laptops/example-14" brand="HP" name="EliteBook 840 (example)" specs={["Core Ultra 7", "16 GB", "1.36 kg"]} />
          <ProductCard href="/products/laptops/example-t14" brand="Lenovo" name="ThinkPad T14 (example)" specs={["Ryzen 7 Pro", "16 GB", "14 in"]} />
          <ProductCard href="/products/workstations/example-z" brand="Dell" name="Precision tower (example)" specs={["Xeon", "64 GB", "RTX A4000"]} />
          <ProductCard href="/products/servers/example-ml" brand="HP" name="ProLiant tower (example)" specs={["Xeon E", "32 GB", "4 bays"]} />
        </div>
      </Block>

      <Block n="08" title="Photo slots">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <Photo subject="Hero: UAE office team around a table with business laptops" ratio="16:9" />
          <Photo subject="Product shot: laptop three-quarter view on a light background" ratio="1:1" />
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted-ink">Until a real photo is uploaded, each slot names the subject and the ratio. The full list for the home page is in BRAND.md section 9.</p>
      </Block>
    </>
  );
}
