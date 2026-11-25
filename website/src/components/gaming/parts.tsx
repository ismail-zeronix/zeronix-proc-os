import type { Icon } from "@phosphor-icons/react";
import { DesktopTower, GameController, GraphicsCard, Headset, Laptop, Monitor } from "@phosphor-icons/react/dist/ssr";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AddToCart } from "@/components/store/cart-buttons";
import type { SiteProductPage } from "@/lib/contract";
import { bestResolution, BUILDS, GAMING_CATEGORIES, GTA6, type BuildTier, type Game, gamePath, DEMAND_WORDS } from "@/lib/gaming";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/**
 * The Gaming look (owner 2026-11-22, second pass): a WHITE stage that still reads as gaming. Near-black ink (#0b0e14),
 * the store green as the only accent, flat colours, no glow, no lime. Game-UI cues come from shape, not colour: HUD
 * corner brackets (.gx-frame), cut corners (.gx-cut), segmented meters, numbered tiers, a faint grid behind the hero
 * (.gx-grid) and a ticker of game titles (globals.css). Used on /gaming, its game pages and the build performance
 * block on Zeronix PC product pages.
 */
export const G = {
  page: "bg-panel text-ink",
  ink: "text-[#0b0e14]",
  panel: "rounded-card border border-line bg-panel",
  panelHover: "transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#0b0e14]/25 hover:shadow-lift",
  muted: "text-muted-ink",
  accentText: "text-brand-900",
  accentBg: "bg-cta",
  track: "bg-[#e9ecef]",
  /** small uppercase HUD label */
  label: "text-[0.625rem] font-bold tracking-[0.16em] uppercase sm:text-[0.6875rem]",
  /** black cut-corner button / chip */
  dark: "gx-cut bg-[#0b0e14] text-white",
} as const;

/** Black cut-corner tier number ("01"), the build's place in the line-up. */
export function TierNo({ n, className }: { n: number; className?: string }) {
  return <span className={cn("gx-cut-sm inline-grid h-6 min-w-8 place-items-center bg-[#0b0e14] px-1.5 font-mono text-[0.6875rem] font-bold text-[#2fcf7a] tabular-nums", className)}>{String(n).padStart(2, "0")}</span>;
}

export const GLYPHS: Record<(typeof GAMING_CATEGORIES)[number]["glyph"] | "controller", Icon> = {
  desktop: DesktopTower,
  laptop: Laptop,
  monitor: Monitor,
  gpu: GraphicsCard,
  headset: Headset,
  controller: GameController,
};

/** Section title: a HUD kicker with a green tick, a bold heading, an optional lead and a link on the right. */
export function GHeading({ kicker, title, lead, href, linkLabel, as: H = "h2" }: { kicker?: string; title: string; lead?: string; href?: string; linkLabel?: string; as?: "h1" | "h2" }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 sm:mb-5">
      <div className="min-w-0">
        {kicker && (
          <p className={cn("mb-1 flex items-center gap-2", G.label, G.accentText)}>
            <span aria-hidden className="gx-cut-sm h-2.5 w-4 bg-cta" />
            {kicker}
          </p>
        )}
        <H className={cn("font-bold tracking-tight", G.ink, H === "h1" ? "text-display" : "text-h2")}>{title}</H>
        {lead && <p className={cn("mt-1 max-w-2xl text-[0.8125rem] sm:text-sm", G.muted)}>{lead}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className={cn("group inline-flex shrink-0 items-center gap-1 text-xs font-bold tracking-wide uppercase sm:text-[0.8125rem]", G.accentText)}>
          {linkLabel} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

const TONE_FILL = { accent: "bg-cta", great: "bg-cta", good: "bg-[#5cc28a]", ok: "bg-[#e8a23a]", low: "bg-[#e5484d]" } as const;

/** A segmented stat meter, 0-100, like a game's stat bar: `segments` blocks, filled to the value. */
export function Bar({ value, className, tone = "accent", segments = 12 }: { value: number; className?: string; tone?: keyof typeof TONE_FILL; segments?: number }) {
  const on = Math.max(1, Math.round((Math.min(100, value) / 100) * segments));
  return (
    <span className={cn("grid h-1.5 gap-0.5", className)} style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }} aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn("rounded-[1px] transition-colors duration-300", i < on ? TONE_FILL[tone] : G.track)} style={{ transitionDelay: `${i * 18}ms` }} />
      ))}
    </span>
  );
}

/** "High" with five steps, for how hard a game pushes a part. */
export function DemandRow({ label, level, detail }: { label: string; level: number; detail: string }) {
  const fill = level >= 5 ? "bg-[#e5484d]" : level >= 4 ? "bg-[#e8a23a]" : "bg-cta";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className={cn("font-semibold", G.ink)}>{label}</span>
        <span className={cn("truncate text-xs", G.muted)}>
          <span className={cn("font-bold", G.ink)}>{DEMAND_WORDS[level]}</span> · {detail}
        </span>
      </div>
      <span className="grid grid-cols-5 gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("gx-cut-sm h-2", i <= level ? fill : G.track)} />
        ))}
      </span>
    </div>
  );
}

/** The spec value for one key of a product (specGroups rows), "" when missing. */
export const specOf = (p: SiteProductPage, key: string) => p.specGroups.flatMap((g) => g.rows).find((r) => r.key === key)?.value ?? "";

/** Short part names for the card ("AMD Ryzen 7 9700X (8 cores…)" → "Ryzen 7 9700X"). */
const short = (v: string) => v.replace(/^(AMD|NVIDIA|Intel)\s+/i, "").replace(/GeForce\s+/i, "").replace(/\s*\(.*\)\s*/, "").trim();

const PARTS: { key: string; label: string; bar: keyof BuildTier["bars"] }[] = [
  { key: "processor", label: "CPU", bar: "cpu" },
  { key: "graphics", label: "GPU", bar: "gpu" },
  { key: "memory", label: "RAM", bar: "ram" },
  { key: "storage", label: "SSD", bar: "storage" },
  { key: "cooler", label: "Cooler", bar: "cooling" },
  { key: "psu", label: "Power", bar: "power" },
];

/**
 * A Zeronix Custom PC: tier number and target, the photo in a HUD frame, name, every main part with a segmented meter
 * against the top build, the board, what it plays GTA VI at, the price and Add to cart. Name, price and parts come from
 * the catalog product. The featured build (GTA VI pick) keeps its corner brackets out and a black ribbon.
 */
export function BuildCard({ tier, product, featured = false }: { tier: BuildTier; product: SiteProductPage; featured?: boolean }) {
  const href = `/products/${product.categorySlug}/${product.slug}`;
  const price = formatPrice(product.price, product.currency);
  const gta = bestResolution(GTA6, tier.key);
  const photo = product.images[0]?.src;
  const n = BUILDS.findIndex((b) => b.key === tier.key) + 1;
  return (
    <article data-on={featured} className={cn("gx-frame group relative flex h-full flex-col gap-3 p-3.5 sm:p-4", G.panel, G.panelHover, featured && "border-[#0b0e14]/25")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <TierNo n={n} />
          <span className={cn(G.label, G.muted)}>{tier.target}</span>
        </span>
        {featured && <span className={cn("px-2 py-1", G.label, G.dark)}>GTA VI pick</span>}
      </div>
      <div className={cn("relative grid place-items-center overflow-hidden rounded-inner bg-surface-soft", photo ? "aspect-[4/3]" : "aspect-[5/2]")}>
        {photo ? (
          <Image src={photo} alt={product.name} fill sizes="(min-width: 1024px) 20vw, 60vw" quality={60} className="object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.05]" />
        ) : (
          <DesktopTower weight="duotone" className="size-14 text-ink/20 transition-colors group-hover:text-brand-900/70 sm:size-16" />
        )}
      </div>
      <div>
        <p className={cn(G.label, G.accentText)}>Zeronix Custom PC</p>
        <h3 className={cn("text-xl leading-tight font-extrabold tracking-tight uppercase sm:text-2xl", G.ink)}>
          <Link href={href} className="after:absolute after:inset-0">
            {tier.name}
          </Link>
        </h3>
        <p className={cn("mt-0.5 line-clamp-2 text-xs", G.muted)}>{tier.tagline}</p>
      </div>
      <dl className="grid gap-2">
        {PARTS.map((part) => {
          const v = specOf(product, part.key);
          if (!v) return null;
          return (
            <div key={part.key} className="grid gap-1">
              <div className="flex items-baseline gap-2 text-xs">
                <dt className={cn("w-11 shrink-0 font-mono text-[0.625rem] font-bold tracking-wider uppercase", G.muted)}>{part.label}</dt>
                <dd className={cn("min-w-0 truncate font-semibold", G.ink)} title={v}>
                  {short(v)}
                </dd>
              </div>
              <Bar value={tier.bars[part.bar]} />
            </div>
          );
        })}
        {specOf(product, "motherboard") && (
          <div className="flex items-baseline gap-2 text-xs">
            <dt className={cn("w-11 shrink-0 font-mono text-[0.625rem] font-bold tracking-wider uppercase", G.muted)}>Board</dt>
            <dd className={cn("min-w-0 truncate font-semibold", G.ink)}>{specOf(product, "motherboard")}</dd>
          </div>
        )}
      </dl>
      {gta && (
        <p className="flex items-center gap-1.5 border-l-2 border-cta bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap text-ink/80">
          <GameController weight="duotone" className="size-4 shrink-0 text-brand-900" />
          GTA VI <span className={cn("font-mono font-bold", G.ink)}>{gta}</span>
          <span className={cn("truncate", G.muted)}>· predicted</span>
        </p>
      )}
      <div className="mt-auto flex items-end justify-between gap-2 border-t border-dashed border-line pt-3">
        <p className="leading-tight">
          <span className={cn("block text-lg font-extrabold tabular-nums sm:text-xl", G.ink)}>{price ?? "Price on request"}</span>
          {price && <span className={cn("text-[0.6875rem]", G.muted)}>incl. VAT</span>}
        </p>
        {product.price && product.priceMode === "public" && <AddToCart item={{ slug: product.slug, name: product.name, href, image: photo ?? null, price: product.price }} className="gx-cut relative z-10 rounded-none bg-[#0b0e14] text-white hover:bg-cta" />}
      </div>
    </article>
  );
}

/** A game tile: the game's colour as a stripe, title, genre, PC status; links to its page. No cover art (publisher copyright). */
export function GameTile({ game, active, onClick }: { game: Game; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 rounded-l-card transition-[width] duration-200", active ? "w-1.5" : "w-1 group-hover:w-1.5")} style={{ background: game.accent }} />
      <span className="grid min-w-0 gap-0.5 pl-1.5 text-left">
        <span className={cn("truncate text-[0.8125rem] font-bold sm:text-sm", active ? "text-white" : G.ink)}>{game.title}</span>
        <span className={cn("truncate text-[0.6875rem]", active ? "text-white/65" : G.muted)}>
          {game.genre} · <span className={game.predicted ? (active ? "text-[#f2b84b]" : "text-amber-700") : ""}>{game.pcStatus}</span>
        </span>
      </span>
    </>
  );
  const cls = cn(
    "group relative flex min-h-14 items-center overflow-hidden px-3 py-2.5",
    active ? "rounded-card border border-[#0b0e14] bg-[#0b0e14] shadow-lift" : cn(G.panel, G.panelHover),
  );
  return onClick ? (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn(cls, "w-full")}>
      {body}
    </button>
  ) : (
    <Link href={gamePath(game)} className={cls}>
      {body}
    </Link>
  );
}

/** Gaming category tiles: cut-corner icon blocks that turn black with a green icon on hover. */
export function GamingCategoryStrip({ counts }: { counts: Record<string, number> }) {
  return (
    <ul aria-label="Gaming categories" className="-mx-3 grid auto-cols-[calc((100%-4*0.5rem)/4.4)] grid-flow-col gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:auto-cols-fr sm:gap-3 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {GAMING_CATEGORIES.map((c) => {
        const Glyph = GLYPHS[c.glyph];
        const n = counts[c.slug] ?? 0;
        return (
          <li key={c.slug}>
            <Link href={`/products/${c.slug}`} className={cn("gx-frame group flex h-full flex-col items-center gap-1.5 px-1.5 py-3 text-center sm:gap-2 sm:py-5", G.panel, G.panelHover)}>
              <span className="gx-cut grid size-11 place-items-center bg-surface text-brand-900 transition-colors duration-200 group-hover:bg-[#0b0e14] group-hover:text-[#2fcf7a] sm:size-14">
                <Glyph weight="duotone" className="size-6 transition-transform duration-300 group-hover:scale-110 sm:size-8" />
              </span>
              <span className={cn("line-clamp-2 text-[0.6875rem] leading-tight font-bold sm:text-sm", G.ink)}>{c.name}</span>
              <span className={cn("hidden font-mono text-[0.625rem] tracking-wider uppercase sm:block", G.muted)}>{n ? `${n} model${n === 1 ? "" : "s"}` : "On request"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
