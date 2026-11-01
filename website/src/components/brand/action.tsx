import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "outline" | "onDark";

const PILL: Record<Variant, string> = {
  primary: "bg-lime-400 text-forest-950 hover:bg-lime-500",
  dark: "bg-forest-900 text-white hover:bg-forest-800",
  outline: "border border-line bg-white/60 text-ink hover:border-forest-700/40 hover:bg-white",
  onDark: "border border-white/20 text-white hover:bg-white/10",
};

const DOT: Record<Variant, string> = {
  primary: "bg-forest-950 text-lime-400",
  dark: "bg-lime-400 text-forest-950",
  outline: "bg-forest-900 text-lime-400",
  onDark: "bg-white text-forest-950",
};

/**
 * The brand button (BRAND.md section 6): a pill with the label and a round arrow at the end, like the references'
 * "Free Consultation" button. `arrow={false}` gives the plain pill.
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
        "group/action inline-flex items-center gap-3 rounded-full font-semibold whitespace-nowrap transition-colors duration-200",
        size === "lg" ? "h-13 pr-1.5 pl-6 text-base" : "h-11 pr-1.5 pl-5 text-sm",
        !arrow && (size === "lg" ? "pr-6" : "pr-5"),
        PILL[variant],
        className,
      )}
    >
      {children}
      {arrow && (
        <span className={cn("grid place-items-center rounded-full transition-transform duration-200 group-hover/action:translate-x-0.5", size === "lg" ? "size-10" : "size-8", DOT[variant])}>
          <ArrowRight className="size-4" />
        </span>
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
        onDark ? "border-white/20 text-white group-hover:border-lime-400 group-hover:bg-lime-400 group-hover:text-forest-950" : "border-line bg-white text-forest-950 group-hover:border-forest-900 group-hover:bg-forest-900 group-hover:text-lime-400",
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
        "inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[0.6875rem] leading-none font-semibold tracking-[0.12em] uppercase",
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
      <h2 className={cn("mt-5 text-h2", onDark ? "text-white" : "text-ink")}>
        {title}
        {rule && <span aria-hidden className={cn("ml-4 inline-block h-px w-16 align-middle", onDark ? "bg-white/25" : "bg-line")} />}
      </h2>
      {lead && <p className={cn("mt-5 text-lead", onDark ? "text-white/70" : "text-muted-ink")}>{lead}</p>}
    </div>
  );
}
