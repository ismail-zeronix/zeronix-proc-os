import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Action } from "@/components/brand/action";
import { Photo } from "@/components/brand/photo";
import type { SiteBrand, SiteHome } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";

/** Last two words of the headline in mint: the brand's one emphasis (never a gradient). */
function Headline({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  const cut = Math.max(1, words.length - 2);
  return (
    <h1 className="max-w-md text-display text-white xl:max-w-lg">
      {words.slice(0, cut).join(" ")} <span className="text-mint-300">{words.slice(cut).join(" ")}</span>
    </h1>
  );
}

/** The two side cards next to the main banner: business buying (lime) and the new-office checklist (white). */
function SideCards({ business, office }: { business: SiteHome["business"]; office: SiteHome["office"] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1 lg:gap-3">
      {business.title && (
        <Link href={business.href || "/quote"} className="group flex flex-col justify-between gap-3 rounded-frame bg-lime-400 p-4 text-forest-950 sm:p-5" data-track="home-business">
          <span className="grid gap-1">
            <span className="text-[0.9375rem] leading-snug font-semibold sm:text-lg">{business.title}</span>
            {business.text && <span className="line-clamp-3 text-xs text-forest-950/75 sm:text-sm">{business.text}</span>}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold sm:text-sm">
            {business.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}
      {office.title && (
        <div className="flex flex-col gap-2.5 rounded-frame border border-line/70 bg-white p-4 sm:p-5">
          <span className="text-[0.9375rem] leading-snug font-semibold text-ink sm:text-lg">{office.title}</span>
          <ul className="grid gap-1.5">
            {office.items.map((l, i) => (
              <li key={l.href + l.label} className={i > 1 ? "hidden sm:block" : undefined}>
                <Link href={l.href} className="inline-flex items-start gap-2 text-xs text-ink hover:text-forest-700 sm:text-sm">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-forest-700" strokeWidth={3} />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Store-style top of the home page: a slim forest banner (words, two actions, product photo) with two side cards, then
 * quick-link chips (what visitors came to do) and a one-line benefit strip. Built for phones first.
 */
export function Hero({ brand, home }: { brand: SiteBrand; home: SiteHome }) {
  const h = home.hero;
  return (
    <section className="container-site grid gap-2.5 pt-3 sm:gap-3 sm:pt-4">
      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-[2.2fr_1fr]">
        <div className="relative isolate grid overflow-hidden rounded-frame bg-forest-900 text-white sm:grid-cols-[1.15fr_1fr]">
          <div className="grid content-center gap-3 p-5 sm:gap-4 sm:p-7 lg:p-8">
            {h.eyebrow && <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-mint-300 uppercase">{h.eyebrow}</p>}
            <Headline text={h.title || brand.tagline} />
            {h.subtitle && <p className="max-w-md text-sm text-white/75 sm:text-[0.9375rem]">{h.subtitle}</p>}
            <div className="flex flex-wrap gap-2">
              <Action href="/products" track="home-hero-shop">
                {h.shopLabel}
              </Action>
              <Action href="/quote" variant="onDark" arrow={false} track="home-hero-quote">
                {brand.ctaLabel}
              </Action>
            </div>
            {h.checks.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
                {h.checks.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-mint-300" strokeWidth={2.5} /> {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Photo
            src={imageFor("hero") ?? imageFor("industry-corporate-offices")}
            subject="Business laptops, a monitor and a desktop on a bright office desk"
            fill
            priority
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            tone="dark"
            className="hidden rounded-none sm:block"
          />
        </div>
        <SideCards business={home.business} office={home.office} />
      </div>

      {home.intents.length > 0 && (
        <nav aria-label="What do you need?" className="scroll-row lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
          {home.intents.map((x) => (
            <Link key={x.href} href={x.href} className="inline-flex h-11 items-center gap-2.5 rounded-full border border-line/70 bg-white pr-4 pl-1.5 text-sm font-semibold text-ink transition-colors hover:border-forest-900" data-track="home-intent">
              <span className="grid size-8 place-items-center rounded-full bg-lime-400 text-forest-950">
                <SiteIconView name={x.icon} className="size-4" strokeWidth={1.75} />
              </span>
              {x.label}
            </Link>
          ))}
        </nav>
      )}

      {home.benefits.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-card border border-line/70 bg-white px-4 py-3 lg:grid-cols-4 lg:divide-x lg:divide-line/70 lg:px-2">
          {home.benefits.map((b) => (
            <li key={b.title} className="flex items-center gap-2.5 lg:px-4">
              <SiteIconView name={b.icon} className="size-5 shrink-0 text-forest-700" strokeWidth={1.75} />
              <span className="grid leading-tight">
                <span className="text-xs font-semibold text-ink sm:text-sm">{b.title}</span>
                {b.text && <span className="hidden text-xs text-muted-ink sm:block">{b.text}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
