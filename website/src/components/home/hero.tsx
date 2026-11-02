import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Action, Tag } from "@/components/brand/action";
import { IconBadge } from "@/components/brand/cards";
import { Photo } from "@/components/brand/photo";
import type { SiteBrand, SiteHome } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";

/** Last two words of the headline in mint: the brand's one emphasis (never a gradient). */
function Headline({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  const cut = Math.max(1, words.length - 2);
  return (
    <h1 className="max-w-xl text-display text-white">
      {words.slice(0, cut).join(" ")} <span className="text-mint-300">{words.slice(cut).join(" ")}</span>
    </h1>
  );
}

/** What visitors came to do, as a white card on the photo (beside it on large screens, under it on phones). */
function IntentCard({ intents }: { intents: SiteHome["intents"] }) {
  if (!intents.length) return null;
  return (
    <nav aria-label="What do you need?" className="grid gap-0.5 rounded-card bg-white p-2 text-ink shadow-lift lg:absolute lg:top-1/2 lg:-right-2 lg:w-64 lg:-translate-y-1/2 xl:-right-6">
      {intents.map((x) => (
        <Link key={x.href} href={x.href} className="group flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-sage-50" data-track="home-intent">
          <IconBadge name={x.icon} className="size-9" />
          <span className="flex-1 text-sm font-semibold">{x.label}</span>
          <ChevronRight className="size-4 text-muted-ink transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </nav>
  );
}

/** Four promises on a white strip that overlaps the bottom of the hero. */
function Benefits({ benefits }: { benefits: SiteHome["benefits"] }) {
  if (!benefits.length) return null;
  return (
    <div className="container-site relative z-10 -mt-12 sm:-mt-14">
      <ul className="grid grid-cols-2 gap-y-5 rounded-card bg-white p-5 shadow-lift sm:p-6 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {benefits.map((b) => (
          <li key={b.title} className="flex items-center gap-3 px-1 lg:px-6 lg:first:pl-2">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sage-100 text-forest-900">
              <SiteIconView name={b.icon} className="size-5" strokeWidth={1.75} />
            </span>
            <span className="grid leading-tight">
              <span className="text-sm font-semibold text-ink sm:text-[0.9375rem]">{b.title}</span>
              {b.text && <span className="mt-0.5 text-xs text-muted-ink sm:text-[0.8125rem]">{b.text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The split hero: words and the two actions on the left, a product photo with the intent card on the right, then the
 * benefit strip across its bottom edge. Forest frame, mint emphasis, lime fills only (BRAND.md).
 */
export function Hero({ brand, home }: { brand: SiteBrand; home: SiteHome }) {
  const h = home.hero;
  return (
    <section className="mt-2">
      <div className="frame relative isolate overflow-hidden bg-forest-900 text-white">
        {/* one quiet shape behind the photo, in the brand's own greens (no glow, no gradient text) */}
        <div aria-hidden className="absolute inset-y-0 right-0 -z-10 hidden w-[46%] rounded-l-[6rem] bg-forest-800/70 lg:block" />
        <div className="container-site grid items-center gap-10 pt-12 pb-24 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16 lg:pb-28">
          <div className="grid gap-6">
            {h.eyebrow && <Tag onDark>{h.eyebrow}</Tag>}
            <Headline text={h.title || brand.tagline} />
            {h.subtitle && <p className="max-w-lg text-lead text-white/75">{h.subtitle}</p>}
            <div className="flex flex-wrap gap-3">
              <Action href="/products" size="lg" track="home-hero-shop">
                {h.shopLabel}
              </Action>
              <Action href="/quote" size="lg" variant="onDark" arrow={false} track="home-hero-quote">
                {brand.ctaLabel}
              </Action>
            </div>
            {h.checks.length > 0 && (
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
                {h.checks.map((c) => (
                  <li key={c} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-mint-300" strokeWidth={2.5} /> {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-4 lg:relative lg:block">
            <Photo
              src={imageFor("hero") ?? imageFor("industry-corporate-offices")}
              subject="Business laptops, a monitor and a desktop on a bright office desk"
              ratio="4:3"
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              tone="dark"
              className="rounded-card lg:mr-24"
            />
            <IntentCard intents={home.intents} />
          </div>
        </div>
      </div>
      <Benefits benefits={home.benefits} />
    </section>
  );
}
