import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "outline" | "onDark" | "light";

const PILL: Record<Variant, string> = {
  primary: "bg-brand-900 text-on-brand hover:bg-brand-800",
  dark: "bg-brand-900 text-on-brand hover:bg-brand-800",
  outline: "border border-ink/15 bg-panel text-ink hover:border-ink/40",
  onDark: "border border-white/30 text-white hover:bg-white/10",
  /** white button for green bands */
  light: "bg-band-btn text-band-btn-ink hover:bg-band-btn-hover",
};


/**
 * The brand button: a solid, gently rounded store button with a small trailing arrow. `arrow={false}` drops the arrow.
 */
export function Action({
  href,
  children,
  variant = "primary",
  arrow = true,
  size = "md",
  className,
  track,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  arrow?: boolean;
  size?: "md" | "lg";
  className?: string;
  /** Name for the analytics (data-track); links to /quote are counted even without it. */
  track?: string;
}) {
  return (
    <Link
      href={href}
      data-track={track}
      className={cn(
        "group/action inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors duration-200",
        size === "lg" ? "h-10 px-4 text-[0.8125rem] sm:h-11 sm:px-5 sm:text-sm lg:h-12 lg:px-6 lg:text-[0.9375rem]" : "h-9 px-3.5 text-[0.8125rem] sm:h-10 sm:px-4 sm:text-sm",
        PILL[variant],
        className,
      )}
    >
      {children}
      {arrow && (
        <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform duration-200 group-hover/action:translate-x-0.5" />
      )}
    </Link>
  );
}

/** The round ↗ in the corner of a clickable card; turns to → when the card (a `group`) is hovered. */
export function ArrowCircle({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border transition-all duration-200 group-hover:rotate-45",
        onDark ? "border-white/20 text-white group-hover:border-cta group-hover:bg-cta group-hover:text-on-brand" : "border-line bg-panel text-brand-950 group-hover:border-brand-900 group-hover:bg-brand-900 group-hover:text-on-brand",
        className,
      )}
    >
      <ArrowUpRight className="size-4" />
    </span>
  );
}

/** Small outlined uppercase pill above headings and inside cards ("WHO WE ARE", "GUIDE"). */
export function Tag({ children, onDark = false, className }: { children: React.ReactNode; onDark?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 w-fit items-center rounded-md border px-2 text-[0.625rem] leading-none font-semibold tracking-[0.08em] uppercase sm:h-6 sm:text-[0.6875rem]",
        onDark ? "border-white/20 text-white/80" : "border-line bg-white/70 text-muted-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section heading: tag, title (medium weight), optional thin rule and lead text. */
export function SectionHeading({
  tag,
  title,
  lead,
  onDark = false,
  rule = false,
  center = false,
  className,
}: {
  tag?: string;
  title: React.ReactNode;
  lead?: string;
  onDark?: boolean;
  rule?: boolean;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("reveal max-w-2xl", center && "mx-auto text-center", className)}>
      {tag && <Tag onDark={onDark}>{tag}</Tag>}
      <h2 className={cn(tag ? "mt-2" : "", "text-h2", onDark ? "text-white" : "text-ink")}>
        {title}
        {rule && <span aria-hidden className={cn("ml-4 inline-block h-px w-16 align-middle", onDark ? "bg-white/25" : "bg-line")} />}
      </h2>
      {lead && <p className={cn("mt-1.5 text-sm sm:mt-2 sm:text-lead", onDark ? "text-white/70" : "text-muted-ink")}>{lead}</p>}
    </div>
  );
}
