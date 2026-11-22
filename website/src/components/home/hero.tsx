import { Cpu, Desktop, Laptop, SecurityCamera, WifiHigh } from "@phosphor-icons/react/dist/ssr";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { SiteBrand, SiteHome, SiteProductSummary } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

/**
 * Home hero in the noon.com pattern.
 * The five photo banners, words on the calm part of each photo. Desktop: the owner's reference layout, three tall
 * banners and two stacked ones. Phones: the same banners as one swipeable row of full-cover photos (no dots).
 */

/** The newest pictured products, priced first: the home page keeps them out of the banners and the featured row. */
export function heroPicks(products: SiteProductSummary[]) {
  return products
    .filter((p) => p.image)
    .sort((a, b) => Number(Boolean(formatPrice(b.price))) - Number(Boolean(formatPrice(a.price))))
    .slice(0, 3);
}

/** The desktop banners (the owner's reference layout): three tall category banners, two stacked service banners. */
type Tone = "mint" | "slate" | "cool" | "white";
interface BannerSpec {
  key: string;
  href: string;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  tone: Tone;
  /** Shown when there is no photo and no product picture (always for services). */
  Glyph?: typeof WifiHigh;
  /** Background photo (public/images/hero-banners). The words sit on its calm area: the top of a tall photo, the
   *  left of a wide one. */
  photo?: string;
  /** Text colour on the photo: "dark" photo = white text. */
  onPhoto?: "light" | "dark";
  /** A soft wash behind the words (white, or black on a dark photo) where the calm area of the photo is still busy. */
  wash?: boolean;
  /** CSS object-position for the photo crop (desktop); `phoneFocus` for the narrow photo half on phones. */
  focus?: string;
  phoneFocus?: string;
}
const TALL: BannerSpec[] = [
  { key: "laptops", href: "/products/laptops", eyebrow: "Business IT", title: "Business laptops. Ready for work.", text: "Reliable, secure and built for modern business.", cta: "Explore laptops", tone: "mint", Glyph: Laptop, photo: "/images/hero-banners/business-laptops.webp", onPhoto: "light", focus: "60% 50%", phoneFocus: "50% 72%" },
  { key: "gaming", href: "/search?q=gaming", eyebrow: "Gaming", title: "Build your advantage.", text: "High-performance PCs for gamers and creators.", cta: "Gaming PCs", tone: "slate", Glyph: Desktop, photo: "/images/hero-banners/gaming-pcs.webp", onPhoto: "dark", wash: true, focus: "50% 100%", phoneFocus: "60% 45%" },
  { key: "workstations", href: "/products/workstations", eyebrow: "Professional workstations", title: "Power for big ideas.", text: "Compute, design and simulate without limits.", cta: "Workstations", tone: "cool", Glyph: Cpu, photo: "/images/hero-banners/workstations.webp", onPhoto: "light", focus: "40% 50%", phoneFocus: "60% 82%" },
];
const SIDE: BannerSpec[] = [
  { key: "networking", href: "/services/networking-wifi", eyebrow: "Networking solutions", title: "Stay connected. Stay ahead.", text: "Fast, secure Wi-Fi and network infrastructure.", cta: "Networking", tone: "white", Glyph: WifiHigh, photo: "/images/hero-banners/networking.webp", onPhoto: "light", focus: "0% 50%", phoneFocus: "100% 50%" },
  { key: "security", href: "/services/cctv-surveillance", eyebrow: "Security & access", title: "Smarter security starts here.", text: "CCTV, access control and attendance systems.", cta: "CCTV & access", tone: "mint", Glyph: SecurityCamera, photo: "/images/hero-banners/security-access.webp", onPhoto: "light", wash: true, focus: "100% 40%", phoneFocus: "100% 50%" },
];
const TONE: Record<Tone, string> = { mint: "bg-surface text-ink", slate: "bg-ink text-white", cool: "bg-[#e6edf3] text-ink", white: "bg-white text-ink" };

function CtaChip({ label, dark, className }: { label: string; dark: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-fit items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors",
        dark ? "border border-white/50 text-white group-hover:bg-white group-hover:text-ink" : "bg-brand-900 text-white group-hover:bg-brand-800",
        className,
      )}
    >
      {label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </span>
  );
}

/**
 * One banner. A photo dropped in as public/images/banner-<key>.(webp|jpg|png) fills it (keep the left third calm for
 * the words); until then it is a flat colour with a real product picture (categories) or a large icon (services).
 */
function Banner({ b, product, tall }: { b: BannerSpec; product?: SiteProductSummary; tall: boolean }) {
  const photo = b.photo ?? imageFor(`banner-${b.key}`);
  const dark = photo ? b.onPhoto === "dark" : b.tone === "slate";
  const art = product?.image ? (
    <Image src={product.image.src} alt="" fill sizes={tall ? "320px" : "200px"} className={cn("object-contain transition-transform duration-500 group-hover:scale-[1.04]", tall ? "object-bottom p-2" : "p-3", b.tone !== "slate" && "mix-blend-multiply")} />
  ) : b.Glyph ? (
    <span className="absolute inset-0 grid place-items-center">
      <span className={cn("grid place-items-center rounded-full text-brand-900", tall ? "size-36 xl:size-40" : "size-24 xl:size-28", b.tone === "white" ? "bg-surface" : "bg-white")}>
        <b.Glyph weight="duotone" className={tall ? "size-16 xl:size-20" : "size-12 xl:size-14"} />
      </span>
    </span>
  ) : null;
  return (
    <Link
      href={b.href}
      data-track={`home-banner-${b.key}`}
      className={cn("group relative isolate flex h-full overflow-hidden rounded-xl", TONE[b.tone], b.tone === "white" && "ring-1 ring-line ring-inset", tall ? "flex-col p-6 xl:p-7" : "items-center gap-3 p-5 xl:p-6")}
    >
      {photo && <Image src={photo} alt="" fill sizes={tall ? "(min-width: 1280px) 330px, 260px" : "(min-width: 1280px) 440px, 340px"} style={{ objectPosition: b.focus }} className="-z-10 object-cover transition-transform duration-700 group-hover:scale-[1.03]" />}
      {photo && b.wash && (
        <span
          aria-hidden
          className={cn(
            "absolute -z-10",
            tall ? "inset-x-0 top-0 h-[55%] bg-linear-to-b" : "inset-y-0 left-0 w-2/3 bg-linear-to-r",
            dark ? "from-black/80 via-black/55 to-transparent" : "from-white/90 via-white/70 to-transparent",
          )}
        />
      )}
      <span className={cn("relative z-10 grid content-start", tall ? "gap-2" : "w-[54%] gap-1.5")}>
        <span className={cn("border-l-2 pl-2 text-[0.625rem] leading-none font-semibold tracking-[0.14em] whitespace-nowrap uppercase xl:text-[0.6875rem]", dark ? "border-highlight text-highlight" : "border-brand-900 text-ink/80")}>{b.eyebrow}</span>
        <span className={cn("mt-1 font-bold tracking-tight text-balance", tall ? "text-[1.625rem] leading-[1.1] xl:text-[1.875rem]" : "text-lg leading-[1.15] xl:text-xl")}>{b.title}</span>
        <span className={cn("max-w-[17rem] text-[0.8125rem] leading-snug", tall ? "xl:text-sm" : "line-clamp-2", dark ? "text-white/75" : "text-muted-ink")}>{b.text}</span>
        {!tall && <CtaChip label={b.cta} dark={dark} className="mt-1.5 h-9" />}
      </span>
      {!photo && art && <span className={cn("relative", tall ? "-mx-2 mt-3 -mb-2 flex-1" : "h-full flex-1")}>{art}</span>}
      {tall && <CtaChip label={b.cta} dark={dark} className="absolute bottom-6 left-6 z-10 xl:bottom-7 xl:left-7" />}
    </Link>
  );
}

/**
 * Phones: one banner as a full-cover photo with the words over its left side. A soft wash (white, or black on a dark
 * photo) keeps the words readable on every crop.
 */
function PhoneBanner({ b, first = false }: { b: BannerSpec; first?: boolean }) {
  const photo = b.photo ?? imageFor(`banner-${b.key}`);
  const dark = photo ? b.onPhoto === "dark" : b.tone === "slate";
  return (
    <Link href={b.href} data-track={`home-banner-${b.key}`} className={cn("group relative isolate flex h-full flex-col justify-between overflow-hidden rounded-xl p-3.5 sm:p-5", TONE[b.tone], dark ? "text-white" : "text-ink")}>
      {photo && (
        <>
          {/* the first banner is the first thing a phone shows: fetched straight away, ahead of everything below it */}
          <Image src={photo} alt="" fill sizes="(min-width: 640px) 64vw, 90vw" quality={60} loading={first ? "eager" : "lazy"} fetchPriority={first ? "high" : "auto"} style={{ objectPosition: b.phoneFocus ?? b.focus }} className="-z-10 object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
          <span aria-hidden className={cn("absolute inset-y-0 left-0 -z-10 w-[78%] bg-linear-to-r", dark ? "from-black/80 via-black/50 to-transparent" : "from-white/90 via-white/65 to-transparent")} />
        </>
      )}
      <span className="grid max-w-[62%] gap-1 sm:max-w-[55%] sm:gap-1.5">
        <span className={cn("border-l-2 pl-2 text-[0.625rem] leading-tight font-semibold tracking-[0.12em] uppercase", dark ? "border-highlight text-highlight" : "border-brand-900 text-ink/80")}>{b.eyebrow}</span>
        <span className="text-base leading-tight font-bold tracking-tight text-balance sm:text-xl">{b.title}</span>
        <span className={cn("line-clamp-1 text-[0.6875rem] leading-snug sm:line-clamp-2 sm:text-xs", dark ? "text-white/80" : "text-ink/70")}>{b.text}</span>
      </span>
      <CtaChip label={b.cta} dark={dark} className="h-8 px-3 text-xs sm:h-9 sm:px-3.5 sm:text-[0.8125rem]" />
    </Link>
  );
}

export function Hero({ brand, home, bannerProducts }: { brand: SiteBrand; home: SiteHome; bannerProducts: Record<string, SiteProductSummary | undefined> }) {
  const banners = [...TALL, ...SIDE];
  // phones: a 16:9 banner (about 190 px tall at 390 px wide) with the next one peeking in; tablets: fixed height
  const slide = "aspect-[16/9] w-[90%] shrink-0 snap-start sm:aspect-auto sm:h-64 sm:w-[64%]";

  return (
    <section className="container-site pt-2 sm:pt-3 lg:pt-4">
      <h1 className="sr-only">{home.hero.title || brand.tagline}</h1>

      {/* phones and tablets: the same banners as one swipeable row (the next one peeks in at the edge) */}
      <div className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-3 px-3 [scrollbar-width:none] sm:-mx-5 sm:scroll-px-5 sm:px-5 lg:hidden [&::-webkit-scrollbar]:hidden">
        {banners.map((b, i) => (
          <div key={b.key} className={slide}>
            <PhoneBanner b={b} first={i === 0} />
          </div>
        ))}
      </div>

      {/* desktop: three tall category banners and two stacked service banners */}
      <div className="hidden h-[28rem] grid-cols-[1.12fr_1fr_1fr_1.3fr] grid-rows-2 gap-3 lg:grid xl:h-[30rem]">
        {TALL.map((b) => (
          <div key={b.key} className="row-span-2">
            <Banner b={b} product={bannerProducts[b.key]} tall />
          </div>
        ))}
        {SIDE.map((b) => (
          <Banner key={b.key} b={b} tall={false} />
        ))}
      </div>
    </section>
  );
}

/** The benefits: small white chips that scroll sideways on phones, one white strip on desktop. */
export function Benefits({ home }: { home: SiteHome }) {
  if (!home.benefits.length) return null;
  return (
    <section className="container-site mt-2 lg:mt-3">
      <ul className="-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-line lg:overflow-visible lg:rounded-xl lg:bg-white lg:px-0 [&::-webkit-scrollbar]:hidden">
        {home.benefits.map((b) => (
          <li key={b.title} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 lg:gap-3 lg:rounded-none lg:bg-transparent lg:px-5 lg:py-4">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-brand-900 lg:size-9">
              <SiteIconView name={b.icon} className="size-3.5 lg:size-4.5" strokeWidth={2} />
            </span>
            <span className="grid leading-tight">
              <span className="text-[0.6875rem] font-medium whitespace-nowrap text-ink lg:text-sm lg:font-semibold">{b.title}</span>
              {b.text && <span className="hidden text-xs text-muted-ink lg:block">{b.text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
