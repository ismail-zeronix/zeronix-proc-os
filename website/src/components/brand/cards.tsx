import Link from "next/link";
import { AddToQuote } from "@/components/quote/quote-buttons";
import { SiteIconView } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ArrowCircle, Tag } from "./action";
import { Photo, type PhotoRatio } from "./photo";

/** The card family of BRAND.md section 6. Every clickable card is one link with an ArrowCircle in its corner. */

const lift = "transition-shadow duration-200 hover:shadow-lift";

/** Icon in a circle: lime on light, mint on dark. */
export function IconBadge({ name, onDark = false, className }: { name: string; onDark?: boolean; className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", onDark ? "bg-forest-800 text-mint-300" : "bg-lime-400 text-forest-950", className)}>
      <SiteIconView name={name} className="size-[1.125rem]" strokeWidth={1.75} />
    </span>
  );
}

/** 1. Photo card: tall photo in an inner frame, title row with the arrow. Industries, guides, people. */
export function PhotoCard({ href, title, photo, subject, ratio = "4:5", icon, className }: { href: string; title: string; photo?: string; subject: string; ratio?: PhotoRatio; icon?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group flex flex-col rounded-card bg-white p-2", lift, className)}>
      <div className="relative">
        <Photo src={photo} subject={subject} ratio={ratio} />
        {icon && <IconBadge name={icon} className="absolute top-3 left-3" />}
      </div>
      <div className="flex items-center justify-between gap-3 px-3 pt-4 pb-2">
        <h3 className="text-base font-semibold sm:text-lg">{title}</h3>
        <ArrowCircle />
      </div>
    </Link>
  );
}

/** 2. Feature card (light): tag top-left, arrow top-right, title, a photo at the bottom. `tone="sage"` for the sage fill. */
export function FeatureCard({
  href,
  tag,
  title,
  text,
  photo,
  subject,
  tone = "white",
  className,
}: {
  href: string;
  tag: string;
  title: string;
  text?: string;
  photo?: string;
  subject?: string;
  tone?: "white" | "sage";
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group flex h-full flex-col gap-5 rounded-card p-6", tone === "sage" ? "bg-sage-100" : "bg-white", lift, className)}>
      <div className="flex items-start justify-between gap-4">
        <Tag>{tag}</Tag>
        <ArrowCircle />
      </div>
      <div>
        <h3 className="max-w-xs text-xl leading-snug font-semibold">{title}</h3>
        {text && <p className="mt-2 text-sm text-muted-ink">{text}</p>}
      </div>
      {subject && <Photo src={photo} subject={subject} ratio="4:3" className={cn("mt-auto", tone === "sage" && "bg-white/60")} />}
    </Link>
  );
}

/** 3. Accent card: lime fill, forest text, a photo. The one highlight in a group. */
export function AccentCard({ href, tag, title, photo, subject, className }: { href: string; tag: string; title: string; photo?: string; subject: string; className?: string }) {
  return (
    <Link href={href} className={cn("group flex h-full flex-col gap-5 rounded-card bg-lime-400 p-6 text-forest-950", lift, className)}>
      <Photo src={photo} subject={subject} ratio="4:3" className="bg-white/40" />
      <div className="mt-auto flex items-end justify-between gap-4">
        <div>
          <Tag className="border-forest-950/20 bg-transparent text-forest-950/70">{tag}</Tag>
          <h3 className="mt-3 max-w-xs text-xl leading-snug font-semibold">{title}</h3>
        </div>
        <ArrowCircle className="border-forest-950 bg-forest-950 text-lime-400" />
      </div>
    </Link>
  );
}

/** 4. Dark card: on a forest band. Mint icon, white title, softer text. */
export function DarkCard({ icon, title, text, className }: { icon: string; title: string; text: string; className?: string }) {
  return (
    <div className={cn("flex h-full flex-col gap-4 rounded-card border border-white/10 bg-forest-800/70 p-6", className)}>
      <IconBadge name={icon} onDark />
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-white/65">{text}</p>
    </div>
  );
}

/** 5. Stat: big Manrope number, the unit in lime (light) or mint (dark), a muted label. */
export function Stat({ value, label, onDark = false }: { value: string; label: string; onDark?: boolean }) {
  const m = value.match(/^([\d.,]+)(.*)$/);
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className={cn("text-sm", onDark ? "text-white/60" : "text-muted-ink")}>{label}</dt>
      <dd className={cn("font-heading text-4xl font-medium tracking-tight tabular-nums sm:text-5xl", onDark ? "text-white" : "text-ink")}>
        {m ? (
          <>
            {m[1]}
            <span className={onDark ? "text-mint-300" : "text-forest-700"}>{m[2]}</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/**
 * 6. Product card, compact like a store shelf: square photo, brand, two-line name, key specs on one line, then the
 * price (VAT included) or "price on request", and the add-to-quote button. Two across on phones, five or six on desktop.
 */
export function ProductCard({
  href,
  brand,
  name,
  specs,
  photo,
  price,
  className,
}: {
  href: string;
  brand: string;
  name: string;
  specs: string[];
  photo?: string;
  /** Formatted public price ("AED 4,399"); null shows "price on request". */
  price?: string | null;
  className?: string;
}) {
  const slug = href.split("/").pop() ?? "";
  return (
    <div className={cn("group relative flex h-full flex-col rounded-card border border-line/70 bg-white p-2 transition-shadow duration-200 hover:shadow-lift", className)}>
      <Photo src={photo} subject={name} ratio="1:1" sizes="(min-width: 1024px) 220px, 45vw" className="bg-white [&_img]:object-contain [&_img]:p-2" />
      <div className="flex flex-1 flex-col gap-1 px-1 pt-2">
        <span className="text-[0.6875rem] font-semibold tracking-wide text-muted-ink uppercase">{brand}</span>
        <h3 className="line-clamp-2 min-h-[2.6em] text-sm leading-snug font-semibold text-ink">
          <Link href={href} className="after:absolute after:inset-0">
            {name}
          </Link>
        </h3>
        {specs.length > 0 && <p className="line-clamp-1 text-xs text-muted-ink">{specs.slice(0, 3).join(" · ")}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {price ? (
            <p className="leading-tight">
              <span className="block text-base font-bold text-ink tabular-nums sm:text-[1.0625rem]">{price}</span>
              <span className="text-[0.6875rem] text-muted-ink">incl. VAT</span>
            </p>
          ) : (
            <Link href={`/quote?product=${encodeURIComponent(slug)}`} className="relative z-10 text-xs leading-tight font-semibold text-forest-800 hover:text-forest-950">
              Price on request
              <span className="block font-normal text-muted-ink">Get B2B quote</span>
            </Link>
          )}
          <AddToQuote slug={slug} name={name} className="relative z-10 size-9 w-9" />
        </div>
      </div>
    </div>
  );
}

/** 7. UI chip: a small white card floating over a photo ("UAE stock · 3-year warranty"). */
export function UiChip({ label, value, icon, className }: { label: string; value: string; icon?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-white/95 py-2.5 pr-4 pl-2.5 shadow-lift backdrop-blur", className)}>
      {icon && <IconBadge name={icon} className="size-9" />}
      <span className="grid leading-tight">
        <span className="text-[0.6875rem] text-muted-ink">{label}</span>
        <span className="text-sm font-semibold text-ink">{value}</span>
      </span>
    </div>
  );
}
