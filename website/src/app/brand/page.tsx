import type { Metadata } from "next";
import { Action, ArrowCircle, SectionHeading, Tag } from "@/components/brand/action";
import { AccentCard, DarkCard, FeatureCard, IconBadge, PhotoCard, ProductCard, Stat, UiChip } from "@/components/brand/cards";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Photo } from "@/components/brand/photo";

/** The brand system, live (BRAND.md). Not linked and not indexed: a reference for whoever builds the next page. */
export const metadata: Metadata = { title: "Brand system", robots: { index: false, follow: false } };

const COLOURS = [
  { name: "forest-950", hex: "#03201A", use: "Deepest: footer, text on lime", cls: "bg-forest-950 text-white" },
  { name: "forest-900", hex: "#06352B", use: "Dark bands, dark buttons", cls: "bg-forest-900 text-white" },
  { name: "forest-800", hex: "#0B4A3B", use: "Cards on dark, hover", cls: "bg-forest-800 text-white" },
  { name: "forest-700", hex: "#12614C", use: "Links, icons on light", cls: "bg-forest-700 text-white" },
  { name: "lime-400", hex: "#B9F23F", use: "Primary CTA fill", cls: "bg-lime-400 text-forest-950" },
  { name: "mint-300", hex: "#4FF0B4", use: "Highlights on dark", cls: "bg-mint-300 text-forest-950" },
  { name: "sage-100", hex: "#E6F1E0", use: "Light cards, image wells", cls: "bg-sage-100 text-forest-950" },
  { name: "sage-50", hex: "#F0F5EC", use: "Alternate sections", cls: "bg-sage-50 text-forest-950" },
  { name: "paper", hex: "#F6F6F1", use: "Page background", cls: "bg-paper text-forest-950 border border-line" },
  { name: "ink", hex: "#0C1F1A", use: "Body text", cls: "bg-ink text-white" },
  { name: "muted", hex: "#5A6B65", use: "Secondary text", cls: "bg-muted-ink text-white" },
  { name: "line", hex: "#DCE3DB", use: "Borders, dividers", cls: "bg-line text-forest-950" },
];

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="container-site border-t border-line py-6 sm:py-8">
      <p className="text-sm font-semibold text-forest-700">{n}</p>
      <h2 className="mt-1 text-3xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function BrandPage() {
  return (
    <>
      {/* hero sample: the Finovate frame with a photo, white headline, lime action and floating UI chips */}
      <section className="frame relative mt-3 bg-forest-900 text-white">
        <div className="relative grid min-h-[34rem] lg:grid-cols-2">
          <div className="relative z-10 flex flex-col justify-center gap-7 p-8 sm:p-12 lg:p-16">
            <Tag onDark>Corporate IT for UAE businesses</Tag>
            <h1 className="max-w-xl text-display text-white">
              Business IT, matched to <span className="text-mint-300">your industry.</span>
            </h1>
            <p className="max-w-md text-lead text-white/70">Laptops, desktops, workstations and servers for the way your team works. UAE stock, local warranty, corporate pricing.</p>
            <div className="flex flex-wrap gap-3">
              <Action href="/quote" size="lg">
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
        <h1 className="mt-5 max-w-3xl text-h2">The rules every page of zeronixtech.com follows.</h1>
        <p className="mt-4 max-w-2xl text-lead text-muted-ink">Written in website/BRAND.md. Warm paper, forest-green bands, lime for action, mint for highlights on dark. Medium-weight headings, pill controls, rounded frames, real photography.</p>
      </div>

      <Block n="01" title="Logo">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid h-40 place-items-center rounded-card bg-white">
            <Logo />
          </div>
          <div className="grid h-40 place-items-center rounded-card bg-forest-900">
            <Logo onDark />
          </div>
          <div className="grid h-40 place-items-center gap-2 rounded-card bg-lime-400">
            <LogoMark className="size-16" />
          </div>
        </div>
      </Block>

      <Block n="02" title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLOURS.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-card bg-white">
              <div className={`h-24 ${c.cls} flex items-end p-3 text-xs font-semibold`}>{c.hex}</div>
              <div className="p-3">
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-muted-ink">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-ink">About 60% paper and white, 25% forest, 10% sage, 5% lime or mint. Lime is a fill, never text on light. No blue, purple, glows or gradient text.</p>
      </Block>

      <Block n="03" title="Typography">
        <div className="grid gap-8 rounded-card bg-white p-8">
          <div>
            <p className="text-xs text-muted-ink">Display · Manrope 500</p>
            <p className="font-heading text-display font-medium">Business IT, matched to your industry.</p>
          </div>
          <div>
            <p className="text-xs text-muted-ink">H2 · Manrope 500</p>
            <p className="font-heading text-h2 font-medium">Every team works differently.</p>
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
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-white p-8">
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
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-forest-900 p-8">
            <Action href="/quote">Get B2B pricing</Action>
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
          <FeatureCard href="/guides" tag="Guide" title="Workstations for architects: what really matters" tone="sage" subject="Architect at a dual-monitor workstation" />
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

      <section className="frame bg-forest-900 py-8 sm:py-10">
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
          <Photo subject="Product shot: laptop three-quarter view on sage" ratio="1:1" />
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted-ink">Until a real photo is uploaded, each slot names the subject and the ratio. The full list for the home page is in BRAND.md section 9.</p>
      </Block>
    </>
  );
}
