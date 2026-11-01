import { Action, Tag } from "@/components/brand/action";
import { UiChip } from "@/components/brand/cards";
import { Photo } from "@/components/brand/photo";
import type { SiteBrand, SiteHome } from "@/lib/contract";
import { SiteIconView } from "@/lib/icons";
import { imageFor } from "@/lib/images";

/** Last two words of the headline in mint: the brand's one emphasis (never a gradient). */
function Headline({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  const cut = Math.max(1, words.length - 2);
  return (
    <h1 className="max-w-2xl text-display text-white">
      {words.slice(0, cut).join(" ")} <span className="text-mint-300">{words.slice(cut).join(" ")}</span>
    </h1>
  );
}

/**
 * The framed photo hero (BRAND.md sections 4 and 9, Finovate): the team photo fills a rounded frame, a forest shade
 * keeps the headline readable on the left, trust pills sit along the bottom and two UI chips float on the photo.
 */
export function Hero({ brand, home }: { brand: SiteBrand; home: SiteHome }) {
  const h = home.hero;
  const pills = home.reasons.slice(0, 3);
  return (
    <section className="frame relative isolate mt-2 bg-forest-900 text-white">
      <Photo
        src={imageFor("hero")}
        subject="Hero: UAE office team around a table with business laptops, warm natural light, people on the right"
        fill
        priority
        sizes="100vw"
        tone="dark"
        slotAt="end"
        className="absolute inset-0 -z-20 rounded-none"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(3_32_26/0.94)_0%,rgb(3_32_26/0.78)_42%,rgb(3_32_26/0.15)_75%,transparent_100%)]" />

      <div className="container-site flex min-h-[36rem] flex-col justify-between gap-12 py-12 sm:py-16 lg:min-h-[40rem]">
        <div className="grid max-w-2xl gap-7 pt-4 lg:pt-10">
          {h.eyebrow && <Tag onDark>{h.eyebrow}</Tag>}
          <Headline text={h.title || brand.tagline} />
          {h.subtitle && <p className="max-w-xl text-lead text-white/75">{h.subtitle}</p>}
          <div className="flex flex-wrap gap-3">
            <Action href="/quote" size="lg" track="home-hero">
              {brand.ctaLabel}
            </Action>
            {h.secondaryCta && (
              <Action href="#industries" size="lg" variant="onDark" arrow={false}>
                {h.secondaryCta}
              </Action>
            )}
          </div>
        </div>

        {pills.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <li key={p.title} className="inline-flex h-11 items-center gap-2.5 rounded-full border border-white/15 bg-forest-950/40 pr-5 pl-2 text-sm font-medium text-white backdrop-blur-md">
                <span className="grid size-7 place-items-center rounded-full bg-lime-400 text-forest-950">
                  <SiteIconView name={p.icon} className="size-3.5" strokeWidth={2} />
                </span>
                {p.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      <UiChip icon="package-check" label="In stock" value="UAE warehouse" className="absolute top-12 right-10 hidden lg:flex" />
      <UiChip icon="shield-check" label="Warranty" value="Up to 3 years, Middle East" className="absolute right-24 bottom-28 hidden xl:flex" />
    </section>
  );
}
