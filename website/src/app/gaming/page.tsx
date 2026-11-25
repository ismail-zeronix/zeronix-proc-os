import { ArrowRight, Check, Truck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CtaStrip, Faq, JsonLd, quoteLink } from "@/components/catalog/page-parts";
import { GameFinder } from "@/components/gaming/game-finder";
import { BuildCard, G, GHeading, GamingCategoryStrip } from "@/components/gaming/parts";
import { ProductRail } from "@/components/home/product-rail";
import { getCategories, getCategory, getProducts, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { bestResolution, buildByKey, GAMES, GAMING_CATEGORIES, GTA6, gamePath, RESOLUTIONS } from "@/lib/gaming";
import { finderBuilds, loadBuilds } from "@/lib/gaming-data";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

export const revalidate = 600;

export const metadata: Metadata = {
  title: { absolute: "Gaming PCs in the UAE: Custom Builds, GTA VI Ready | Zeronix Tech" },
  description: "Zeronix Custom Gaming PCs from 1080p esports to 4K max, with estimated FPS in GTA VI, Warzone, EA FC, CS2, Valorant and more. Gaming laptops, monitors and gear, delivered across the UAE.",
  alternates: { canonical: "/gaming" },
};

const FAQ = [
  { q: "Which Zeronix PC do I need for GTA VI on PC?", a: "Rockstar has not published PC requirements yet. Based on the console version and today's biggest open-world games, we recommend the Riptide for 1440p and the Havoc as the lowest build for a smooth 1080p. We update the page when official requirements are out." },
  { q: "Can I change the parts in a build?", a: "Yes. Every Zeronix PC is built to order: ask for a different graphics card, more memory or storage, or a different case, and we send the new price." },
  { q: "Are the FPS numbers guaranteed?", a: "No, they are estimates from public benchmarks of the same processor and graphics card at High settings. Real results depend on the settings you pick, drivers and game updates." },
  { q: "Do you deliver gaming PCs across the UAE?", a: "Yes, to all seven emirates. Builds are assembled and tested before they leave us." },
];

export default async function GamingPage() {
  const [{ brand }, builds, { categories }] = await Promise.all([getSettings(), loadBuilds(), getCategories()]);
  const counts = Object.fromEntries(categories.map((c) => [c.slug, c.count]));
  const others = GAMING_CATEGORIES.filter((c) => c.slug !== "gaming-pcs" && (counts[c.slug] ?? 0) > 0);
  const [rails, pages] = await Promise.all([
    Promise.all(others.map((c) => getProducts({ category: c.slug, limit: 12 }).then((r) => r.products))),
    Promise.all(GAMING_CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0).map((c) => getCategory(c.slug).catch(() => null))),
  ]);
  const brands = [...new Map(pages.flatMap((p) => p?.brands ?? []).filter((b) => b.slug !== "zeronix").map((b) => [b.slug, b])).values()];
  const finder = finderBuilds(builds);
  const gtaPicks = builds.filter((b) => ["havoc", "riptide", "warpath"].includes(b.tier.key));
  const from = builds[0] ? formatPrice(builds[0].product.price, builds[0].product.currency) : null;
  const recTier = buildByKey(GTA6.recommended);
  const recFps = GTA6.fps[recTier.key][RESOLUTIONS.indexOf(recTier.resolution)];

  return (
    <>
      <div className={G.page}>
        {/* hero: words and HUD stats left, the gaming PC in a bracket frame right (stacked on phones), on a faint grid */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="gx-grid absolute inset-0 -z-10" />
          <div className="container-site grid items-center gap-6 py-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:py-14">
            <div className="grid gap-3.5 sm:gap-5">
              <p className={cn("flex items-center gap-2", G.label, G.accentText)}>
                <span className="gx-cut-sm bg-[#0b0e14] px-1.5 py-0.5 font-mono text-[#2fcf7a]">GG</span>
                Zeronix Gaming
              </p>
              <h1 className={cn("text-2xl leading-[1.05] font-black tracking-tight uppercase sm:text-4xl xl:text-[2.5rem]", G.ink)}>
                Gaming PCs built for the <span className="text-brand-900">games you play.</span>
              </h1>
              <p className={cn("max-w-xl text-lead", G.muted)}>Five Zeronix Custom PCs from 1080p esports to 4K max, with the frame rates to expect in GTA VI, Warzone, EA FC, CS2 and more.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/gaming/gta-6-pc" className="gx-cut group inline-flex h-11 items-center gap-2 bg-[#0b0e14] px-5 text-sm font-bold text-white transition-colors duration-200 hover:bg-cta" data-track="gaming-hero-gta">
                  GTA VI Ready PCs <ArrowRight className="size-4 text-[#2fcf7a] transition-[transform,color] group-hover:translate-x-1 group-hover:text-white" />
                </Link>
                <a href="#builds" className="gx-cut inline-flex h-11 items-center bg-surface-soft px-5 text-sm font-bold text-ink transition-colors hover:bg-[#e3e6e9]">
                  Shop custom PCs
                </a>
              </div>
              {/* HUD stats */}
              <dl className="grid grid-cols-[repeat(3,minmax(0,0.75fr))_minmax(0,1.25fr)] border-y border-line py-3">
                {[
                  [String(builds.length || 5).padStart(2, "0"), "Builds"],
                  ["4K", "Max res"],
                  [String(GAMES.length).padStart(2, "0"), "Games"],
                  [from ? from.replace(/\.00$/, "") : "UAE", from ? "From" : "Delivery"],
                ].map(([v, k], i) => (
                  <div key={k} className={cn("grid gap-0.5 px-2 sm:px-4", i === 0 ? "pl-0 sm:pl-0" : "border-l border-line")}>
                    <dd className={cn("truncate font-mono text-base font-extrabold tabular-nums sm:text-xl xl:text-2xl", G.ink)}>{v}</dd>
                    <dt className={cn("order-first text-[0.5625rem] sm:text-[0.625rem]", G.label, G.muted)}>{k}</dt>
                  </div>
                ))}
              </dl>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink/75">
                <li className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-brand-900" /> Built to order</li>
                <li className="inline-flex items-center gap-1.5"><Wrench className="size-3.5 text-brand-900" /> Change any part</li>
                <li className="inline-flex items-center gap-1.5"><Truck className="size-3.5 text-brand-900" /> Delivered across the UAE</li>
              </ul>
            </div>
            <div className="gx-frame group" data-on="true">
              <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-surface-soft">
                <Image src="/images/hero-banners/gaming-pcs.webp" alt="Zeronix gaming PC" fill priority sizes="(min-width: 1024px) 50vw, 100vw" quality={60} className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" style={{ objectPosition: "50% 70%" }} />
                <span className="gx-cut absolute bottom-3 left-3 flex items-center gap-2 bg-[#0b0e14]/90 px-3 py-2 font-mono text-[0.6875rem] font-bold text-white backdrop-blur-sm sm:bottom-4 sm:left-4 sm:text-xs">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full rounded-full bg-[#2fcf7a] opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-2 rounded-full bg-[#2fcf7a]" />
                  </span>
                  GTA VI · {recTier.resolution} · <span className="text-[#2fcf7a]">{recFps} FPS</span>
                  <span className="font-sans font-medium text-white/55">predicted</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ticker of the games we rate: two copies slide left, pauses on hover */}
        <section aria-label="Games we rate" className="overflow-hidden border-y border-line bg-surface-soft">
          <div className="gx-marquee flex w-max">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
                {GAMES.map((g) => (
                  <li key={g.slug} className="flex items-center">
                    <Link href={gamePath(g)} tabIndex={copy === 1 ? -1 : undefined} className={cn("px-4 py-2.5 text-xs font-extrabold tracking-[0.12em] whitespace-nowrap uppercase transition-colors hover:text-brand-900 sm:px-6 sm:text-[0.8125rem]", G.ink)}>
                      {g.title}
                    </Link>
                    <span aria-hidden className="gx-cut-sm size-2 bg-cta" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* GTA VI: the search everyone is making */}
        <section className="container-site py-6 sm:py-10">
          <div data-on="true" className={cn("gx-frame relative grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-8", G.panel)}>
            <div className="grid gap-2">
              <p className={cn("flex items-center gap-2", G.label)} style={{ color: GTA6.accent }}>
                <span aria-hidden className="gx-cut-sm h-2.5 w-4" style={{ background: GTA6.accent }} />
                {GTA6.pcStatus} · predicted
              </p>
              <h2 className={cn("text-h2 font-extrabold tracking-tight", G.ink)}>GTA VI is out on console. Be ready when it lands on PC.</h2>
              <p className={cn("text-[0.8125rem] sm:text-sm", G.muted)}>Rockstar has not announced PC requirements yet. These are our picks from what today&apos;s biggest open worlds need, and we update them the day official specs arrive.</p>
              <Link href="/gaming/gta-6-pc" className={cn("group mt-1 inline-flex items-center gap-1 text-xs font-bold tracking-wide uppercase sm:text-[0.8125rem]", G.accentText)}>
                GTA VI PC requirements and builds <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {gtaPicks.map(({ tier, product }) => {
                const res = bestResolution(GTA6, tier.key);
                const rec = tier.key === GTA6.recommended;
                return (
                  <li key={tier.key}>
                    <Link
                      href={`/products/${product.categorySlug}/${product.slug}`}
                      className={cn("gx-cut group grid gap-1 p-3 transition-colors duration-200", rec ? "bg-[#0b0e14] text-white" : "bg-surface-soft hover:bg-[#e3e6e9]")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-extrabold tracking-wide uppercase", rec ? "text-white" : G.ink)}>{tier.name}</span>
                        {rec && <span className={cn("text-[0.5625rem] text-[#2fcf7a]", G.label)}>Our pick</span>}
                      </span>
                      <span className={cn("font-mono text-2xl font-extrabold tabular-nums", rec ? "text-[#2fcf7a]" : G.ink)}>
                        {GTA6.fps[tier.key][res === "4K" ? 2 : res === "1440p" ? 1 : 0]}
                        <span className={cn("ml-1 text-[0.625rem] font-bold", rec ? "text-white/60" : G.muted)}>FPS · {res ?? "1080p"}</span>
                      </span>
                      <span className={cn("text-xs font-bold", rec ? "text-white/80" : G.accentText)}>{formatPrice(product.price, product.currency)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="container-site pb-6 sm:pb-10">
          <GHeading kicker="Shop gaming" title="Gaming categories" />
          <GamingCategoryStrip counts={counts} />
        </section>

        {builds.length > 0 && (
          <section id="builds" className="container-site scroll-mt-20 pb-6 sm:pb-10">
            <GHeading kicker="Zeronix Custom PCs" title="Pick your build" lead="Every part listed, with bars against our top build. Built to order: swap any part and we send the new price." href="/products/gaming-pcs" linkLabel="All gaming PCs" />
            <ul className="-mx-3 grid auto-cols-[78%] grid-flow-col gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-3 sm:px-0 lg:grid-cols-3 xl:grid-cols-5 [&::-webkit-scrollbar]:hidden">
              {builds.map((b) => (
                <li key={b.tier.key} className="snap-start">
                  <BuildCard tier={b.tier} product={b.product} featured={b.tier.key === GTA6.recommended} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="games" className="container-site scroll-mt-20 pb-8 sm:pb-12">
          <GHeading kicker="Game ready" title="Find a PC for your game" lead="The games most played in the UAE. Pick one to see what it asks of each part and how every build runs it." />
          <GameFinder builds={finder} />
        </section>

        {others.map((c, i) =>
          rails[i].length > 0 ? (
            <section key={c.slug} className="container-site pb-8 sm:pb-12">
              <GHeading title={c.name} href={`/products/${c.slug}`} linkLabel="View all" />
              <ProductRail products={rails[i]} label={c.name} />
            </section>
          ) : null,
        )}

        {brands.length > 0 && (
          <section className="container-site pb-8 sm:pb-12">
            <GHeading title="Gaming brands" />
            <ul className="flex flex-wrap gap-2">
              {brands.map((b) => (
                <li key={b.slug}>
                  <Link href={`/brands/${b.slug}`} className="gx-cut inline-flex h-10 items-center bg-surface-soft px-4 text-xs font-extrabold tracking-[0.1em] text-ink uppercase transition-colors duration-200 hover:bg-[#0b0e14] hover:text-white">
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="pt-2">
        <Faq items={FAQ} title="Gaming PC questions" />
        <CtaStrip title="Want a build of your own?" text="Tell us the games, the resolution and the budget. We spec it, build it and deliver it." quoteHref={`${quoteLink({ category: "gaming-pcs" })}`} label={brand.ctaLabel} />
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Zeronix Custom Gaming PCs",
          itemListElement: builds.map((b, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/products/${b.product.categorySlug}/${b.product.slug}`, name: b.product.name })),
        }}
      />
    </>
  );
}
